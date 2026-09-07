function dirtyTransformPosition(lat, lon, dx, dy){
    // dx and dy are in meters
    let metersPerDegLat = 111_111
    let metersPerDegLon = 111_111 * Math.cos(lat * Math.PI/180)

    let newLat = (dy / metersPerDegLat) + lat // 111,111 meters is roughly equal to 1 degree latitude
    let newLon = (dx / metersPerDegLon) + lon // 111,111 meters is roughly equal to 1 degree longitude
    
    return [newLat, newLon]
}
function dirtyTransformPositionViaAngle(start, dist, bearing){
    // dx is in meters
    // bearing is cw of north
    let theta = -(bearing - 90); // subtract 90 and then invert the angle to get ccw of east
    theta *= Math.PI/180 // degrees to radian
    let dx = dist * Math.cos(theta)
    let dy = dist * Math.sin(theta)

    return dirtyTransformPosition(start[0], start[1], dx, dy)
}
function mpsToMph(mps){
    return mps * 2.236936
}
function distanceBetweenLatLons(start, end){
    return Math.sqrt( Math.pow(start[0]-end[0], 2) + Math.pow(start[1]-end[1], 2) )
}
function distanceBetweenAngles(a, b){
    // assuming a and b are in degrees
    /*
    let d = a - b
    return (d+180) % 360 - 180
    */
    return Math.abs(((a-b+180) % 360 + 360) % 360 - 180)
}

function getClosestStopAndDistFromLatLon(pos){
    let closestStop = null
    let shortestDist = Infinity
    Object.values(stops).forEach(stop=>{
        let dist = distanceBetweenLatLons(stop.getPosition(), pos)
        if(dist > shortestDist){ return } // continue in a forEach loop
        shortestDist = dist
        closestStop = stop
    })
    return [closestStop, shortestDist]
}

function getTimeHHMMSS(){
    let date = new Date()
    let hrs = ('00'+date.getHours()).slice(-2);
    let mins = ('00'+date.getMinutes()).slice(-2);
    let secs = ('00'+date.getSeconds()).slice(-2);
    let t = `${hrs}:${mins}:${secs}`
    return t
}
function hhmmssToSecondsSinceMidnight(hhmmss){
    let splits = hhmmss.split(":")
    let hrs = parseInt(splits[0])
    let mins = parseInt(splits[1])
    let secs = parseInt(splits[2])
    return (hrs * 60*60) + (mins * 60) + secs
}
function getTimeSinceMidnight(){
    let date = new Date()
    return (date.getHours() * 60*60) + (date.getMinutes() * 60) + date.getSeconds()
}
function clock24HrToPrefered(hhmmss, removeZeroSeconds=false){
    
    
    splits = hhmmss.split(":")
    let hours = parseInt(splits[0])
    let minutes = parseInt(splits[1])
    let seconds = parseInt(splits[2])

    if(use24HrClock){
        if(removeZeroSeconds && seconds==0){ hhmmss = `${splits[0]}:${splits[1]}` }
        return hhmmss
    }
    

    let postfix = hours >= 12 ? "pm" : "am"
    if(hours > 12){
        hours -= 12
    }
    let out = `${hours}:${splits[1]}`
    if(removeZeroSeconds == false || seconds != 0){ out += `:${splits[2]}` }
    return out + postfix
}
function secondsUntil(hhmmss){
    let arriveTime = hhmmssToSecondsSinceMidnight(hhmmss)
    let timeNow = getTimeSinceMidnight()
    let deltaT = arriveTime - timeNow // arrival time should (usually) always be higher than the current time
    return deltaT
}
function secondsToCountdownTime(seconds){
    let hours = Math.floor(seconds / (60*60))
    seconds -= hours*60*60
    let minutes = Math.floor(seconds / 60)
    seconds -= minutes*60

    // round up the seconds
    if(seconds >= 30){ minutes += 1 }

    out = ""
    if(hours != 0){
        out += `${hours}hr`
        if(hours != 1){ out += "s" }
    }
    if(minutes != 0){
        if(out != ""){ out += " and " }
        out += `${minutes}min`
        if(minutes != 1){ out += "s" }
    }

    return out
}

function removeOldStops(sinceMidnight=0){
    Object.keys(stops).forEach(sId=>{
        let s = stops[sId]
        let i = 0
        while(i<s.tripStops.length){
            let ts = s.tripStops[i]
            // this is an exact time, remove the value immediately
            if(ts.isTimeExact && ts.arrivalTimeSeconds > sinceMidnight){ break; }
            // we'll leave it still there for ~1 minute afterwards, incase the bus is running a bit late
            if(ts.arrivalTimeSeconds+60 > sinceMidnight){ break; }
            i++;
        }
        if(i != 0){
            s.tripStops = s.tripStops.splice(i)
        }
        s.onScheduleUpdated()
    })
}
function newMinute(){
    // code that triggers at the start of every minute
    let sinceMidnight = getTimeSinceMidnight()
    // check if we're now within 1m:50s of midnight and if so, refresh the page so we can get our stops back
    if(sinceMidnight < 110){
        console.log("Midnight has just passed, refreshing to get list of stops back")
        document.location.reload()
    }

    removeOldStops(sinceMidnight)
    
}
setTimeout(() => {
    newMinute()
    setInterval(newMinute, 60_000)
}, 60_000 - (Date.now()%60_000)); // initial delay to sync us to the minute

function removeAllStops(){
    Object.keys(stops).forEach(sKey=>{
        map.removeLayer( stops[sKey].icon )
    })
    stops = {}
}
function removeAllRoutes(){
    Object.keys(routes).forEach(rKey=>{
        lines = Object.values(routes[rKey].polyLine)
        lines.forEach(pLine => {
            map.removeLayer(pLine)
        });
    })
    routes = {}
}
function removeAllVehicles(){
    Object.keys(vehicles).forEach(vKey=>{
        map.removeLayer( vehicles[vKey].icon )
        map.removeLayer( vehicles[vKey].directionArrow )
    })
    vehicles = {}
}

let positionUpdateInterval = null
function updateUserPosition(isFromInterval=true){
    const options = {
        enableHighAccuracy: true,
        timeout: 5000,
        maximumAge: 0,
    };
    navigator.geolocation.getCurrentPosition((posObj)=>{
        let pos = [posObj.coords.latitude, posObj.coords.longitude]

        if(userMarker == null){
            userMarker = L.circleMarker(pos, {
                radius: 8,
                fillColor: "#428cf4",
                color: "#ffffff",
                weight: 2,
                opacity: 1,
                fillOpacity: 1
            })
            userMarker.addTo(map)
            map.setView(pos, 15) // move the map to center on them once when we first load them
        }
        userMarker.setLatLng(pos)
    },
    (error)=>{
        console.error(error)
        if(isFromInterval == false){return}
        clearInterval(positionUpdateInterval)

        // wait 5 seconds before trying again
        setTimeout(() => {
            positionUpdateInterval = setInterval(() => {
                updateUserPosition()
            }, 1_000); // 10s
        }, 5000);
    },options);
}

updateUserPosition(false)
positionUpdateInterval = setInterval(() => {
    updateUserPosition()
}, 1000);
