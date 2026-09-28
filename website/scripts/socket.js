let ws = null
let statusIndicator = document.getElementById("connectionStatusIndicatorEle")

function closeWebsocket(){
    if(ws == null){
        console.log("[!!!] Websocket is not opened! We cannot close it")
    }
    ws.close()
}

function reconnectWebsocket(){
    console.log(API_URL)
    ws = new WebSocket(API_URL)
    
    ws.onopen = (e)=>{
        console.log("Websocket opened!")
        statusIndicator.innerText = CONNECTING_MESSAGE
        
        let wantDate = getDateValueYYYYMMDD()
        let storedDate = window.localStorage.getItem("storedDate")
        if(storedDate == null || storedDate != wantDate){
            console.log("Fetching data for date: ", wantDate)
            window.localStorage.setItem("storedDate", wantDate)

            let requestedDatePacket = {
                "type": "requestDate",
                "date": wantDate,
            }
            ws.send( JSON.stringify(requestedDatePacket) )
            statusIndicator.innerText = FETCHING_DATA_MESSAGE + "(1/4)"
        }
        else{
            console.log("Already saved data from ", wantDate)
            stopsPacket = {"type": "stopsInfo", "data": JSON.parse(window.localStorage.getItem("stopsInfo")) }
            shapesPacket = {"type": "shapesInfo", "data": JSON.parse(window.localStorage.getItem("shapesInfo")) }
            routesPacket = {"type": "routesInfo", "data": JSON.parse(window.localStorage.getItem("routesInfo")) }
            tripsPacket = {"type": "tripsInfo", "data": JSON.parse(window.localStorage.getItem("tripsInfo")) }

            handleWebsocketPacket(stopsPacket)
            handleWebsocketPacket(shapesPacket)
            handleWebsocketPacket(routesPacket)
            handleWebsocketPacket(tripsPacket)
        }
    }

    ws.onclose = (e)=>{
        console.log("Websocket closed!")
        statusIndicator.innerText = NOT_CONNECTED_MESSAGE
        // cleanup our old data, not that we don't have a source of truth
        removeAllStops()
        shapes = {} // nothing to remove here
        removeAllRoutes()
        trips = {}
        removeAllVehicles()
        // remove and add it back and it will remove all of it's entries from being recreated
        map.removeLayer(routeControl)
        routeControl.addTo(map)

        setTimeout(() => {
            // wait 1 second before trying to reconnect
            reconnectWebsocket()
        }, 1000);
    }

    ws.onerror = (e)=>{
        console.error(e)
        //ws.onclose()
        statusIndicator.innerText = NOT_CONNECTED_MESSAGE
    }

    ws.onmessage = (e)=>{
        let data = JSON.parse(e.data)
        handleWebsocketPacket(data)
    }
    
    
    function handleWebsocketPacket(data){
        let printData = true
        let type = data["type"]
        let packetData = data["data"]
        if(type == "stopsInfo"){
            packetData.forEach(stopData => {
                s = new Stop(stopData)
                stops[s.getId()] = s
                s.updateIcon()
            });
            window.localStorage.setItem("stopsInfo", JSON.stringify(packetData))
            statusIndicator.innerText = FETCHING_DATA_MESSAGE + "(2/4)"
        }
        else if(type == "shapesInfo"){
            packetData.forEach(shapeData => {
                s = new Shape(shapeData)
                shapes[s.getId()] = s
            });
            window.localStorage.setItem("shapesInfo", JSON.stringify(packetData))
            statusIndicator.innerText = FETCHING_DATA_MESSAGE + "(3/4)"
        }
        else if(type == "routesInfo"){
            packetData.forEach(routeData => {
                r = new Route(routeData)
                // show only the O1-O4 routes initially
                if(r.getShortName().startsWith("O")){ r.showRoute = true; }
                routes[r.getId()] = r
            });
            window.localStorage.setItem("routesInfo", JSON.stringify(packetData))
            statusIndicator.innerText = FETCHING_DATA_MESSAGE + "(4/4)"
        }
        else if(type == "tripsInfo"){
            packetData.forEach(tripData => {
                t = new Trip(tripData)
                trips[t.getId()] = t
            });

            Object.keys(routes).forEach(rId=>{
                addRouteToControl(rId)
            })
            Object.keys(stops).forEach(sId=>{
                stops[sId].sortScheduledStops()
            })
            removeOldStops(getTimeSinceMidnight())
            window.localStorage.setItem("tripsInfo", JSON.stringify(packetData))
            statusIndicator.innerText = CONNECTED_MESSAGE
        }
        else if(type == "feed"){
            if(getDateYYYYMMDD() != getDateValueYYYYMMDD()){
                statusIndicator.innerText = NO_LIVE_UPDATES_MESSAGE
                return
            }

            printData = false // don't print the 1 million feed packets we're gonna get
            console.log("Got feed update")

            dataMadeTime = packetData["timestamp"]
            packetData["vehicles"].forEach(vehicleData => {
                vId = vehicleData.id
                v = vehicles[vId]
                if(v == null){
                    // new vehicle we haven't made an object for! Make it now 
                    v = new Vehicle(vehicleData)
                }
                else{
                    if(v.timestamp != vehicleData.timestamp){
                        // if the timestamps dont match then the vehicle has updated it's data!
                        v.populateData(vehicleData)
                        v.onUpdate()
                    }
                }
                vehicles[vId] = v
                v.onUpdate()
            });
        }
        else{
            console.error("Unknown type of packet!!")
        }

        if(printData){ console.log(data) }
    }
}

reconnectWebsocket() // init connect to the api websocket
