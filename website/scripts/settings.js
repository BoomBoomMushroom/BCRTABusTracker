let use24HrClock = false
let useLibertyMap = true

let PROD_API_URL = "wss://oxfordbusapi.sabrina.hackclub.app"
let TEST_API_URL = "ws://127.0.0.1:8002"

let API_URL = PROD_API_URL
if(window.location.hostname == "localhost"){ API_URL = TEST_API_URL }