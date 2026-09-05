let OccupancyStatus = {
    "EMPTY": "Empty",
    "MANY_SEATS_AVAILABLE": "Many seats available",
    "FEW_SEATS_AVAILABLE": "Few seats available",
    "STANDING_ROOM_ONLY": "Standing room only",
    "CRUSHED_STANDING_ROOM_ONLY": "Crushed standing room only",
    "FULL": "Full",
    "NOT_ACCEPTING_PASSENGERS": "Not accepting passengers",
    "NO_DATA_AVAILABLE": "No data",
    "NOT_BOARDABLE": "Not boardable"
}

class Stop{
    constructor(stopObj){
        this.id = stopObj.id
        this.name = stopObj.name
        this.desc = stopObj.desc
        this.lat = stopObj.lat
        this.lon = stopObj.lon
        this.tripStops = []

        this.icon = null
    }

    updateIcon(){
        if(this.icon != null){return}
        this.icon = createBusStopIcon(this.id)
    }
    getPopupText(){
        let descText = this.desc
        descText += "The time table is scrollable!"

        let text = `
        <div style="min-width: 200px; margin-bottom: 5px;">
            <h3 style="margin-bottom: 0px;">${this.name}</h3>
            <span>${descText}</span>
        </div>
        `
        let routeDropdowns = {} //key,val = routeShortname, html for that
        this.tripStops.forEach(ts=>{
            // TODO: check if the route is being shown or not, and if not skip it.
            //      I don't think we dont care to see stops about hidden routes
            let trip = trips[ts.tripId]
            let route = routes[trip.getRouteId()]
            let timePrefix = ts.isTimeExact ? "" : "Approx ~"
            let style = `style="background-color: #${route.color}; color: #${route.textColor}; margin-bottom:5px;"`
            
            let routeText = routeDropdowns[route.shortName]
            if(routeText == null){
                routeText = `
                <details class="routeDropdown-${route.shortName}">
                    <summary><span class="routeLabel" ${style}>${route.shortName}</span></summary>
                    <div class="routeStopsScroll">
                `
                // end that route text with </div></details>
            }
            routeText += `\n
            <span>${timePrefix}${clock24HrToPrefered(ts.arrivalTime)}</span>
            <br>
            <span style="margin-left: 20px; margin-bottom:15px;">Arrives in ${secondsToCountdownTime(secondsUntil(ts.arrivalTime))}</span>
            <br>
            `
            routeDropdowns[route.shortName] = routeText
        })
        let routeDropdownKeys = Object.keys(routeDropdowns)
        routeDropdownKeys.sort() // use keys so we can sort them
        routeDropdownKeys.forEach(rtKey=>{
            let rt = routeDropdowns[rtKey]
            text += rt + "</div></details><br>"
        })

        return text
    }

    addTripStop(tripStopObject){
        this.tripStops.push(tripStopObject)
    }
    sortScheduledStops(){
        // ascending order, flip `b` and `a` for descending order
        this.tripStops.sort((a,b)=>{return a.arrivalTimeSeconds - b.arrivalTimeSeconds})
    }
    onScheduleUpdated(){
        if(this.tripStops.length == 0){
            map.removeLayer(this.icon) // calling this many times seemingly is fine
            return; // no more stops, that about all we can do
        }

        // get a list of the opened dropdowns
        let openedRoutes = []
        if(this.icon.isPopupOpen()){
            let popupEle = this.icon.getPopup().getElement()
            if(popupEle){
                popupEle.querySelectorAll("details[open]").forEach(details => {
                    let routeClassName = details.classList[0]
                    openedRoutes.push(routeClassName)
                })
            }
        }

        this.icon.bindPopup(this.getPopupText()) // update the text

        if(openedRoutes.length > 0 && this.icon.isPopupOpen()){
            let popupEle = this.icon.getPopup().getElement()
            popupEle.querySelectorAll("details").forEach(details => {
                let routeClassName = details.classList[0]
                if(openedRoutes.includes(routeClassName)){
                    details.open = true
                }
            })
        }
    }

    getId(){return this.id }
    getName(){return this.name }
    getDesc(){return this.desc }
    getPosition(){return [this.lat, this.lon] }
}

class Shape{
    constructor(shapeObj){
        this.id = shapeObj.id // str
        this.points = shapeObj.points // list[ (lat,lon) ]
        this.distanceTraveled = shapeObj.distanceTraveled // in km?
    }
    getId(){ return this.id }
    getPoints(){ return this.points }
    getClosestPointIndex(fromPoint){
        let closestDist = Infinity
        let closestIdx = -1
        for(let i=0; i<this.points.length; i++){
            let pt = this.points[i]
            let dist = distanceBetweenLatLons(fromPoint, pt)
            if(dist > closestDist){ continue }
            closestDist = dist
            closestIdx = i
        }
        return closestIdx
    }
}

class Route{
    constructor(routeObj, showRoute=false){
        this.id = routeObj.id
        this.shortName = routeObj.shortName
        this.longName = routeObj.longName
        this.color = routeObj.color
        this.textColor = routeObj.textColor

        this.polyLine = {}
        this.allShapeIds = []
        this.isRouteShown = showRoute
    }
    getId(){ return this.id }
    getShortName(){ return this.shortName }
    getLongName(){ return this.longName }
    getColor(){ return this.color }
    getTextColor(){ return this.textColor }
}

class Trip{
    constructor(tripObj){
        this.id = tripObj.id
        this.direction = tripObj.direction
        this.stopTimes = tripObj.stopTimes
        this.routeId = tripObj.routeId
        this.shapeId = tripObj.shapeId

        // we should now init our route w/ its shape
        r = this.getRoute()
        if(r.polyLine[this.getShapeId()] == null){
            s = this.getShape()
            r.polyLine[this.getShapeId()] = createRoutePolyline(s.getPoints(), r.getColor())
            routes[r.getId()] = r
        }

        // set stops that will happen in the corresponding Stop data data
        this.stopTimes.forEach(st=>{
            stops[st["stopId"]].addTripStop(st)
        })
    }

    getNextStop(){
        let sinceMidnight = getTimeSinceMidnight()
        let nextStop = null
        for(let i=0; i<this.stopTimes.length; i++){
            let st = this.stopTimes[i]
            nextStop = stops[st.stopId]
            if(st.arrivalTimeSeconds >= sinceMidnight){ break; }
        }
        return nextStop
    }

    getId(){ return this.id }
    getDirection(){ return this.direction }
    getRouteId(){ return this.routeId }
    getShapeId(){ return this.shapeId }

    getRoute(){ return routes[this.routeId] }
    getShape(){ return shapes[this.shapeId] }
}

class Vehicle{
    constructor(vehicleObj){
        // put all of the init stuff inside of populateData since we'll call it to update our data instead of making new vehicle objects many times
        this.populateData(vehicleObj)
        
        this.hidden = false
        this.icon = null // icon to move when position updates
        this.directionArrow = null // icon to point in the direction of travel

        this.smoothTravelInterval = null
        this.nextStop = null
    }
    populateData(vehicleObj){
        this.id = vehicleObj.id
        this.startTime = vehicleObj.startTime
        this.direction = vehicleObj.direction
        this.originalLat = vehicleObj.lat
        this.originalLon = vehicleObj.lon
        this.bearing = vehicleObj.bearing // degresses CW from North
        this.speed = vehicleObj.speed // m/s
        this.timestamp = vehicleObj.timestamp
        this.occupancyStatus = vehicleObj.occupancyStatus
        this.tripId = vehicleObj.tripId

        this.lat = this.originalLat
        this.lon = this.originalLon

        clearInterval(this.smoothTravelInterval)
        this.smoothTravelInterval = setInterval(() => {
            let dt = (Date.now()/1000) - this.timestamp
            // underestimate the speed so if it slows down we dont just back really far
            //  but if it was speeding up then jumping forward is fine
            //  users would rather see it jump forward than backwards
            let displacement = (this.speed * dt) / 2
            let newPos = dirtyTransformPositionViaAngle([this.originalLat, this.originalLon], displacement, this.bearing)
            this.lat = newPos[0]
            this.lon = newPos[1]
        }, 10);
    }

    onUpdate(){
        if(this.icon == null){
            this.icon = createVehicleIcon(this.getId())
        }
        if(this.directionArrow == null){
            this.directionArrow = createDirectionArrow(this.getId())
        }
        // TODO: seemingly after 11pm the route of some of the last buses change and then they freeze
        //      Maybe we need to check if they're trip is gone, or if they're missing from the list
        let trip = this.getTrip()
        if(trip == null){
            // No trip for this bus? Make him disappear then
            this.hidden = true
        }
        else{
            let route = trip.getRoute()
            this.hidden = route.isRouteShown == false
        }

        this.icon.bindPopup(this.getPopupText())
        this.updatePosition()
    }
    updatePosition(){
        let pos = this.getPosition()
        this.icon.setLatLng( this.getPosition() )
        this.directionArrow.setLatLng( this.getPosition() )
        this.directionArrow.getElement().querySelector(".arrow").style.transform = `rotate(${v.getBearing()}deg)`
    }

    calculateNextStop(){
        let position = this.getPosition()
        let trip = trips[this.tripId]
        if(trip == null){return}
        let shape = shapes[trip.shapeId]
        let shapePoints = shape.getPoints()
        let closestUnmovedIndex = shape.getClosestPointIndex(position)
        // which direction do we go on our shape?
        let incrementor = 1

        // at the start of the trip, we do nothing since incrementor is already 1
        //  first stop we find is our next stop
        if(closestUnmovedIndex == 0){}
        // we're at the the trip, we cant do anything here, i cant see the future to know what trip is next
        //  nor do i want to use some lookup table to find whats next
        else if(closestUnmovedIndex == shapePoints.length-1){ return }
        else{
            let bearingEastCCW = -(this.bearing-90)

            let pointBefore = shapePoints[closestUnmovedIndex-1]
            let angleBefore = Math.atan2( pointBefore[0]-position[0], pointBefore[1]-position[1] )
            angleBefore *= (180/Math.PI)
            let distBefore = distanceBetweenAngles(angleBefore, bearingEastCCW)

            let pointAfter = shapePoints[closestUnmovedIndex+1]
            let angleAfter = Math.atan2( pointAfter[0]-position[0], pointAfter[1]-position[1] )
            angleAfter *= (180/Math.PI)
            let distAfter = distanceBetweenAngles(angleAfter, bearingEastCCW)

            if(distAfter > distBefore){ incrementor = -1 }
        }

        // actually find the next stop
        this.nextStop = null
        // TODO: try and strike a balance bewteen starting on closestUnmovedIndex & that+1
        //  For the first one it delay itself for half way to the next checkpoint before updating
        //  For the 2nd one it will set it's new stop right at, and slightly before going to the it's current stop 
        for(let i=closestUnmovedIndex; i<shapePoints.length; i+=incrementor){
            let pt = shapePoints[i]
            let shopAndDist = getClosestStopAndDistFromLatLon(pt)
            
            let closestStop = shopAndDist[0]
            let distFromStop = shopAndDist[1]
            if(distFromStop != 0){ continue; }
            
            // first stop that is on our path! we found the next stop <3
            this.nextStop = closestStop
            break
        }

    }

    getId(){ return this.id }
    getStartTime(){ return this.startTime }
    getDirection(){ return this.direction }
    getPosition(){
        if(this.hidden){
            // we dont want to view this bus, so we're gonna put them in the middle of the ocean
            return [0, 0]
        }
        return [this.lat, this.lon]
    }
    getBearing(){ return this.bearing }
    getSpeed(){ return this.speed }
    getTimestamp(){ return this.timestamp }
    getOccupancyStatus(){ return this.occupancyStatus }
    getTripId(){ return this.tripId }
    getTrip(){ return trips[this.getTripId()] }

    getPopupText(){
        this.calculateNextStop()
        if(this.nextStop == null){
            this.nextStop = {"name": ""} // blank stop name as the default
        }

        let trip = this.getTrip()
        if(trip == null){ return ""; }
        let route = trip.getRoute()

        let label = `<span class="routeLabel" style="color: #${route.getTextColor()}; background-color: #${route.getColor()}">${route.getShortName()}</span>`
        let info = `<span><strong>Seats</strong>: ${OccupancyStatus[this.getOccupancyStatus()]}</span>`
        let speed = Math.floor(mpsToMph(this.speed)*100)/100 // round to 2 decimal places

        // TODO: remove this bearing and make each piece of info in-line
        return `<div style='vehicleInfo'>
            ${label}
            <div>
                <strong>Next Stop</strong>: ${this.nextStop.name}<br>
                ${info}<br>
                <strong>Speed</strong>: ${speed}mph
            </div>
        </div>`
    }
}

