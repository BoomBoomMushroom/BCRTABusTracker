GTFS_DATA_API = "https://www.buztrakr.com/gtfs"
GTFS_VEHICLES_API = "https://www.buztrakr.com/gtfs-rt/vehiclepositions"

UPDATE_GTFS_DATA_TIME = 60 * 60 * 23 # 23 hours, give it some leniency when polling every 24hrs, i dont wanna miss it by like 2 seconds
GTFS_DATA_PATH = "./gtfsData/"
LAST_FETCH_GTFS_DATA_FILE = f"{GTFS_DATA_PATH}/_lastFetch.txt"

USE_PLACEHOLDER_VEHICLE_POSITION_DATA = False

import time
import zipfile
import io
import requests
from google.transit import gtfs_realtime_pb2
import transitClasses
import threading

def checkAndFetchGTFSData():
    lastFetchEpoch = 0
    try:
        with open(LAST_FETCH_GTFS_DATA_FILE, "r") as f:
            lastFetchEpoch = float(f.readline()) # read the first line for the lst fetch time
    except: pass # some error, that means our lastFetchEpoch will be and we'll fetch

    if lastFetchEpoch+UPDATE_GTFS_DATA_TIME >= time.time():
        return # it has not been 24 hours since the last fetch, ignore this
    else:
        print(f"It's been at least {UPDATE_GTFS_DATA_TIME}s since the last polling, getting data now")

    zipReq = requests.get(GTFS_DATA_API, stream=True)
    z = zipfile.ZipFile(io.BytesIO(zipReq.content))
    z.extractall(GTFS_DATA_PATH) # this will override the existing files

    # write down what time we last read the data at so we can wait 24 hours before doing it again
    with open(LAST_FETCH_GTFS_DATA_FILE, "w") as f:
        f.write( str(time.time()) )

def getVehicleData() -> transitClasses.Feed:
    feed = gtfs_realtime_pb2.FeedMessage()
    response = requests.get("https://www.buztrakr.com/gtfs-rt/vehiclepositions")
    if response.status_code != 200: return None # if not 200, something went wrong, from my testing a 503
    responseData = response.content

    if USE_PLACEHOLDER_VEHICLE_POSITION_DATA:
        f = open("./vehicleposition_placeholder.pb", "rb")
        responseData = f.read()
        f.close()

    feed.ParseFromString(responseData)
    return transitClasses.Feed(feed)

class GTFS_DataFetcher:
    def __init__(self, onNewFeedCallback):
        self.onNewFeedCallback = onNewFeedCallback
        checkAndFetchGTFSData() # update our static data first before loading anything, since they pull from the static data

        # generate all of our data for routes, trips, etc
        transitClasses.Stop.generateStopsFromFile(f"{GTFS_DATA_PATH}/stops.txt")
        transitClasses.Route.generateRoutesFromFile(f"{GTFS_DATA_PATH}/routes.txt")
        transitClasses.Shape.generateShapesFromFile(f"{GTFS_DATA_PATH}/shapes.txt")
        transitClasses.Trip.generateTripsFromFile(f"{GTFS_DATA_PATH}/trips.txt")
        transitClasses.StopTime.generateTripStopsTimesFromFile(f"{GTFS_DATA_PATH}/stop_times.txt")
        self.feed: transitClasses.Feed = None
        self.feedThread = threading.Thread(target=self.updateFeedLoop, args=(), daemon=True)
        self.feedThread.start()

    def updateFeedLoop(self):
        # TODO: dont fetch data if we dont have clients connected to send the data to
        while True:
            time.sleep(0.01)
            try:
                self.feed = getVehicleData()
            except: self.feed = None # failed to make the request
            if self.feed == None: continue
            self.onNewFeedCallback(self.feed)

if __name__ == "__main__":
    pass

