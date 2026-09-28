let use24HrClock = false
let useLibertyMap = true
let removeZeroSecondsFromStopTime = true

let PROD_API_URL = "wss://oxfordbusapi.sabrina.hackclub.app"
let TEST_API_URL = "ws://127.0.0.1:8002"

let API_URL = PROD_API_URL
if(["localhost", "127.0.0.1"].includes(window.location.hostname)){ API_URL = TEST_API_URL }

let NOT_CONNECTED_MESSAGE = "🔴 Not Connected"
let CONNECTING_MESSAGE = "🟡 Connecting..."
let FETCHING_DATA_MESSAGE = "🟡 Fetching data..."
let CONNECTED_MESSAGE = "🟢 Connected!"
let NO_LIVE_UPDATES_MESSAGE = "🟢 No live feed for non-present day bus routes"
