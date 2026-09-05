var oxfordOhio = [39.5103048, -84.7420519]
var oxfordBounds = L.latLngBounds(
    [39.490, -84.770], // southwest: [lat, lng]
    [39.530, -84.715]  // northeast: [lat, lng]
)
var map = L.map("map").setView(oxfordOhio, 15)
// i've decided not to do bounds since i want users to be able to go wherever,
//  even if that is useles. Also i do support the other lines like R1, and GRL, and GL
//  so if the user wants that who am I to say no
//map.setMaxBounds(oxfordBounds)
//map.setMinZoom(14)

let stops = {} // key,val = stopId, Stop
let shapes = {} // key,val = shapeId, Shape
let routes = {} // key,val = routeId, Route
let trips = {} // key,val = tripId, Trip
let vehicles = {} // key,val = vehicleId, Vehicle

if(useLibertyMap){
    // this looks cleaner imo
    let mapLayer = L.maplibreGL({
        style: 'https://tiles.openfreemap.org/styles/liberty',
    }).addTo(map);
    mapLayer.getMaplibreMap().on("load", () => {
        let mlMap = mapLayer.getMaplibreMap()
        mlMap.getStyle().layers.forEach(layer => {
            if(layer.type === "fill-extrusion"){
                mlMap.setPaintProperty(layer.id, "fill-extrusion-height", 0)
                mlMap.setPaintProperty(layer.id, "fill-extrusion-base", 0)
            }
        })
    })
}
else{
    // the original map
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    }).addTo(map);
}


let routeControl = L.control({position: "topright"})
routeControl.onAdd = (map) => {
    let div = L.DomUtil.create("div", "routeControl")
    div.innerHTML = `
        <div class="routeTitle"><strong>Routes</strong></div>
        <div id="routeList"></div>
    `;
    L.DomEvent.disableClickPropagation(div)
    return div
}
routeControl.addTo(map)
function addRouteToControl(routeId){
    let list = document.getElementById("routeList")

    let row = document.createElement("div")
    row.className = "routeRow"

    let checkbox = document.createElement("input")
    checkbox.type = "checkbox"
    checkbox.checked = routes[routeId].showRoute

    let label = document.createElement("p")
    label.className = "routeLabel"
    label.textContent = routes[routeId].shortName
    label.style.backgroundColor = "#" + routes[routeId].color
    label.style.color = "#" + routes[routeId].textColor
    
    checkbox.addEventListener("change", ()=>{
        if(checkbox.checked){
            lineKeys = Object.keys(routes[routeId].polyLine)
            lineKeys.forEach(pKey => {
                let pLine = routes[routeId].polyLine[pKey]
                pLine.addTo(map)
            });
        }
        else{
            lines = Object.values(routes[routeId].polyLine)
            lines.forEach(pLine => {
                map.removeLayer(pLine)
            });
        }
        routes[routeId].isRouteShown = checkbox.checked
        Object.keys(vehicles).forEach(vId=>{
            vehicles[vId].onUpdate()
        })
    })
    checkbox.dispatchEvent(new Event("change")) // update if it's shown or not based on the current value

    row.appendChild(checkbox)
    row.appendChild(label)
    list.appendChild(row)
}

function createRoutePolyline(points, color){
    if(color.startsWith("#") == false){ color = "#" + color }
    poly = L.polyline(points, {
        color: color,
        weight: 6,
        opacity: 1
    })
    poly.addTo(map)
    return poly
}

function createDirectionArrow(vehicleId){
    let zoom = map.getZoom()
    let size = zoom * 1.5
    let v = vehicles[vehicleId]

    let arrowWidth = 30
    let arrowHeight = 60

    let arrow = L.marker(v.getPosition(), {
        icon: L.divIcon({
            className: "directionArrow",
            html: `
                <div class="arrow">
                    <div class="arrowHead"></div>
                    <div class="arrowLine"></div>
                </div>
            `,
            iconSize: [arrowWidth, arrowHeight],
            iconAnchor: [arrowWidth/2, arrowHeight],
        }),
        interative: false,
        zIndexOffset: -1000, // make go under the bus so we can click the bus and not the arrow
    })
    arrow.addTo(map)
    arrow.getElement().querySelector(".arrow").style.transform = `rotate(${v.getBearing()}deg)`

    return arrow
}

function getBusStopIcon(){
    let zoom = map.getZoom()
    let size = zoom * 1.5

    return new L.Icon({
        iconUrl: "./assets/busStop.svg",
        iconSize: [size,size],
        iconAnchor: [size/2, size/2]
    })
}
function createBusStopIcon(stopId){
    // -100 zindex to prioritize the bus, and still be above the bus's arrows
    let marker = L.marker(stops[stopId].getPosition(), { icon: getBusStopIcon(), zIndexOffset: -100, })
    marker.bindPopup(stops[stopId].getPopupText())
    marker.addTo(map)
    return marker
}

function getVehicleIcon(){
    let zoom = map.getZoom()
    let size = zoom * 1.5
    //console.log(zoom, size)

    return new L.Icon({
        iconUrl: "./assets/bus.png",
        iconSize: [size,size],
        iconAnchor: [size/2, size/2]
    })
}
function createVehicleIcon(vehicleId){
    let marker = L.marker(vehicles[vehicleId].getPosition(), { icon: getVehicleIcon() })
    marker.bindPopup("Loading...")
    marker.on("popupopen", () => {
        vehicles[vehicleId].calculateNextStop()
        marker.setPopupContent(vehicles[vehicleId].getPopupText())
    })
    marker.addTo(map)
    return marker
}
map.on("zoomend", ()=>{
    let vehicleIcon = getVehicleIcon()
    let busStopIcon = getBusStopIcon()

    Object.keys(vehicles).forEach((vehicleId)=>{
        let v = vehicles[vehicleId]
        v.icon.setIcon(vehicleIcon)
    })

    Object.keys(stops).forEach((stopId)=>{
        let s = stops[stopId]
        s.icon.setIcon(busStopIcon)
    })
})
