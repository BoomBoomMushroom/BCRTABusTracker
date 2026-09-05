let ws = null

function reconnectWebsocket(){
    ws = new WebSocket(API_URL)
    
    ws.onopen = (e)=>{
        console.log("Websocket opened!")
    }

    ws.onclose = (e)=>{
        console.log("Websocket closed!")
        // TODO: make a little indicator saying wether we're connected to the server or not
        // cleanup our old data, not that we dont have a source of truth
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
    }

    ws.onmessage = (e)=>{
        let data = JSON.parse(e.data)
        let printData = true

        let type = data["type"]
        let packetData = data["data"]
        if(type == "stopsInfo"){
            packetData.forEach(stopData => {
                s = new Stop(stopData)
                stops[s.getId()] = s
                s.updateIcon()
            });
        }
        else if(type == "shapesInfo"){
            packetData.forEach(shapeData => {
                s = new Shape(shapeData)
                shapes[s.getId()] = s
            });
        }
        else if(type == "routesInfo"){
            packetData.forEach(routeData => {
                r = new Route(routeData)
                // show only the O1-O4 routes initially
                if(r.getShortName().startsWith("O")){ r.showRoute = true; }
                routes[r.getId()] = r
            });
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
        }
        else if(type == "feed"){
            printData = false // dont print the 1 million feed packets we're gonna get
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
            consle.error("Unknown type of packet!!")
        }

        if(printData){ console.log(data) }
    }
}
reconnectWebsocket() // init connect to the api websocket
