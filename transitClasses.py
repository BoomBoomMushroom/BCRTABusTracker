from __future__ import annotations
from google.transit import gtfs_realtime_pb2
from typing import Literal
import csv

import datetime
import time
from zoneinfo import ZoneInfo

OccupancyStatus = Literal["EMPTY", "MANY_SEATS_AVAILABLE", "FEW_SEATS_AVAILABLE", "STANDING_ROOM_ONLY", "CRUSHED_STANDING_ROOM_ONLY", "FULL", "NOT_ACCEPTING_PASSENGERS", "NO_DATA_AVAILABLE", "NOT_BOARDABLE"]
OccupancyStatusFromNum: list[OccupancyStatus] = ["EMPTY", "MANY_SEATS_AVAILABLE", "FEW_SEATS_AVAILABLE", "STANDING_ROOM_ONLY", "CRUSHED_STANDING_ROOM_ONLY", "FULL", "NOT_ACCEPTING_PASSENGERS", "NO_DATA_AVAILABLE", "NOT_BOARDABLE"]

def hhmmssToSeconds(hhmmss: str) -> int:
    splits = hhmmss.split(":")
    hours = int(splits[0])
    minutes = int(splits[1])
    seconds = int(splits[2])
    return (hours * 60*60) + (minutes*60) + seconds

def getTodayObject() -> datetime.datetime:
    # today at our lovely timezone
    return datetime.datetime.fromtimestamp(time.time(), tz=ZoneInfo("America/New_York"))

def getDayNum(date: datetime.datetime) -> int:
    # use this to get it to be 0-6, Sun-Sat like javscript'
    weekday = int(date.strftime('%w'))
    return weekday

def getDateStr(date: datetime.datetime) -> str:
    return f"{date.year}{str(date.month).zfill(2)}{str(date.day).zfill(2)}"

class Feed:
    def __init__(self, feedObj: gtfs_realtime_pb2.FeedMessage):
        self.timestamp: int = int(feedObj.header.timestamp)
        # yes it is `entity` not `entities`
        self.entities: list[VehicleEntity] = [ VehicleEntity(entity) for entity in feedObj.entity ]

    def __str__(self):
        tab = "-> "
        out = f"Feed @ {self.timestamp}"
        if len(self.entities) > 0: out += f"\n{tab}" # add the "\n{tab}" b/c the first one does not get it in the .join
        out += f"\n{tab}".join([str(e) for e in self.entities])
        return out

    def toJson(self) -> dict:
        return {
            "timestamp": self.timestamp,
            "vehicles": [v.toJson() for v in self.entities] # rename it to be easier to understand
        }

class VehicleEntity:
    def __init__(self, vehicleObj):
        self.id: str = vehicleObj.id
        self.tripId: str = vehicleObj.vehicle.trip.trip_id
        self.startTime: str = vehicleObj.vehicle.trip.start_time # "hh:mm:ss" format, not sure if it is 24hr or 12hr
        self.startDate: str = vehicleObj.vehicle.trip.start_date # "yyyymmdd" format
        self.directionId: str = vehicleObj.vehicle.trip.direction_id # 0 or 1 it seems like

        self.lat: float = vehicleObj.vehicle.position.latitude
        self.lon: float = vehicleObj.vehicle.position.longitude
        self.bearing: float = vehicleObj.vehicle.position.bearing # degress, clockwise of north. ie 0=N, 90=E
        self.speed: float = vehicleObj.vehicle.position.speed # meters per second

        self.timestamp: int = vehicleObj.vehicle.timestamp # time when this information was generated
        # there is a `vehicleObj.vehicle.vehicle.id` but it is the same as vehicleObj.id just w/o the `vehicle_` prefix
        self.label: str = vehicleObj.vehicle.vehicle.label
        self.occupancyStatus: OccupancyStatus = OccupancyStatusFromNum[vehicleObj.vehicle.occupancy_status]


        # need trip first
        self.trip: Trip = Trip.getTripFromId(self.tripId)
        self.route: Route = self.trip.getRoute()

    def __str__(self):
        return f"[{self.id}] | {self.trip} | ({self.lat:.8f}, {self.lon:8f}) | {self.speed:.2f}m/s @ {self.bearing:.2f}° CW of North | {self.occupancyStatus}"

    def toJson(self) -> dict:
        return {
            "id": self.id,
            "startTime": self.startTime,
            "direction": self.directionId,
            "lat": self.lat,
            "lon": self.lon,
            "bearing": self.bearing, # degrees CW of north 
            "speed": self.speed, # m/s
            "timestamp": self.timestamp,
            "occupancyStatus": self.occupancyStatus,
            "tripId": self.tripId,
        }

class Route:
    routes: dict[str, Route] = {} # id, route object

    @classmethod
    def generateRoutesFromFile(cls, filePath: str):
        with open(filePath, "r") as f:
            data = csv.DictReader(f)
            for row in data:
                # route_type will always be 3, meaning it is a bus route
                r = Route(
                    row["route_id"],
                    row["route_short_name"], row["route_long_name"],
                    row["route_color"], row["route_text_color"]
                )
                cls.routes[r.id] = r

    @classmethod
    def getRouteFromId(cls, routeId: str) -> Route:
        r: Route = cls.routes.get(routeId, None)
        if r == None: raise Exception(f"Route w/ {routeId=} not found!!")
        return r

    @classmethod
    def getAllRoutesJson(cls) -> list:
        return [ r.toJson() for r in list(cls.routes.values()) ]

    def __init__(self, id, shortName, longName, color, textColor):
        self.id: str = id
        self.shortName: str = shortName
        self.longName: str = longName
        self.color: str = color
        self.textColor: str = textColor

    def toJson(self):
        return {
            "id": self.id,
            "shortName": self.shortName,
            "longName": self.longName,
            "color": self.color,
            "textColor": self.textColor,
        }

class Trip:
    trips: dict[str, Trip] = {} # id, trip object

    @classmethod
    def generateTripsFromFile(cls, filePath: str):
        with open(filePath, "r") as f:
            data = csv.DictReader(f)
            for row in data:
                t = Trip(
                    row["trip_id"], row["route_id"], row["direction_id"], row["shape_id"], row["service_id"]
                )
                cls.trips[t.id] = t

    @classmethod
    def getTripFromId(cls, tripId: str) -> Trip:
        t: Route = cls.trips.get(tripId, None)
        if t == None: raise Exception(f"Trip w/ {tripId=} not found!!")
        return t

    @classmethod
    def getAllTripsJson(cls) -> list[Trip]:
        return [t.toJson() for t in list(cls.trips.values()) if t.isOfferedToday()]

    @classmethod
    def addStopTimeToCorrectTrip(cls, stopTime: StopTime):
        t: Trip = cls.getTripFromId(stopTime.tripId)
        t.stopTimes.append(stopTime)
        cls.trips[t.id] = t

    def __init__(self, id, routeId, direction, shapeId, serviceId):
        self.id: str = id
        self.routeId: str = routeId
        self.direction: str = direction # 0 is one direction (ex. outbound), and 1 is the opposite (ex. inbound)
        self.shapeId: str = shapeId # id for a geojson route shape from shapes.json
        self.serviceId: str = serviceId # used to know if that trip is running on a certain day

        self.stopTimes: list[StopTime] = []
        self.route: Route = Route.getRouteFromId(self.routeId)
        self.shape: Shape = Shape.getShapeFromId(self.shapeId)

    def __str__(self):
        return self.getRoute().shortName

    def isOfferedToday(self):
        date = getTodayObject()
        sId = self.serviceId
        dateStr = getDateStr(date)

        # check if that route has been overridden to be active or not today
        exception = ServiceCalendar.exceptions.get(dateStr, {}).get(self.serviceId, None)
        if exception != None: return exception

        sc: ServiceCalendar = ServiceCalendar.getServiceCalendarFromId(sId)
        return sc.activeDays[getDayNum(date)]

    def toJson(self):
        return {
            "id": self.id,
            "direction": self.direction,

            "stopTimes": [st.toJson() for st in self.stopTimes],
            "routeId": self.routeId,
            "shapeId": self.shapeId,
        }

    def getRoute(self) -> Route: return self.route
    def getShape(self) -> Shape: return self.shape

class Shape:
    shapes: dict[str, Shape] = {} # id, shape object

    @classmethod
    def generateShapesFromFile(cls, filePath: str):
        with open(filePath, "r") as f:
            data = csv.DictReader(f)
            for row in data:
                shapeId = row["shape_id"]
                shapeObj = cls.getShapeFromId(shapeId)
                if shapeObj == None: shapeObj = Shape(shapeId, [], 0) # create a blank shape if we didn't have one for this shape yet
                shapeObj.addPoint(float(row["shape_pt_lat"]), float(row["shape_pt_lon"]))
                # idk if we add the distance or if it overrides the old one, like dist traveled up to that point.
                shapeObj.setDistTraveled(float(row["shape_dist_traveled"]))

                cls.shapes[shapeObj.id] = shapeObj

            #print("\n".join(str(_) for _ in cls.shapes.values()))

    @classmethod
    def getShapeFromId(cls, shapeId: str) -> Shape:
        s: Shape = cls.shapes.get(shapeId, None)
        return s

    @classmethod
    def getAllShapesJson(cls) -> list:
        return [ s.toJson() for s in list(cls.shapes.values()) ]

    def __init__(self, shapeId: str, points: list[tuple[float, float]], distTraveled: float):
        self.id: str = shapeId
        self.points: list[tuple[float, float]] = points
        self.distanceTraveled: float = distTraveled # in kilometers i'm pretty sure

    def __str__(self):
        pointToPrint = ", ".join([f"({_[0]:.8f}, {_[1]:.8f})" for _ in self.points[0:3]])
        return f"[Shape {self.id}] ~ {self.distanceTraveled:.4f}km | [{pointToPrint}, ...]"

    def toJson(self):
        return {
            "id": self.id,
            "points": self.points,
            "distTraveled": self.distanceTraveled,
        }

    def addPoint(self, lat: float, lon: float): self.points.append([lat, lon])
    def setDistTraveled(self, dist: float): self.distanceTraveled = dist

class Stop:
    stops: dict[str, Stop] = {} # id, stop object

    @classmethod
    def generateStopsFromFile(cls, filePath: str):
        with open(filePath, "r") as f:
            data = csv.DictReader(f)
            for row in data:
                stopObj = Stop(row["stop_id"], row["stop_name"], row["stop_desc"], row["stop_lat"], row["stop_lon"])
                cls.stops[stopObj.id] = stopObj

    @classmethod
    def getStopFromId(cls, stopId: str) -> Stop:
        s: Stop = cls.stops.get(stopId, None)
        return s

    @classmethod
    def getAllStopsJson(cls) -> list:
        return [ s.toJson() for s in list(cls.stops.values()) ]

    def __init__(self, id: str, name, desc, lat, lon):
        self.id: str = id
        self.name: str = name
        self.desc: str = desc
        self.lat: float = lat
        self.lon: float = lon

    def __str__(self):
        return f"[Stop {self.id}] {self.name} | {self.desc}, @ ({self.lat}, {self.lon})"

    def toJson(self):
        return {
            "id": self.id,
            "name": self.name,
            "desc": self.desc,
            "lat": self.lat,
            "lon": self.lon,
        }

class StopTime:
    @classmethod
    def generateTripStopsTimesFromFile(cls, filePath: str):
        with open(filePath, "r") as f:
            data = csv.DictReader(f)
            for row in data:
                tripStops = StopTime(
                    row["trip_id"], row["stop_id"],
                    row["arrival_time"], row["departure_time"],
                    row["stop_sequence"], row["timepoint"]
                )
                Trip.addStopTimeToCorrectTrip(tripStops)

    def __init__(self, tripId, stopId, arrivalTime, departureTime, stopSequence, timepoint):
        self.tripId: str = tripId
        self.stopId: str = stopId
        # times are in HH:MM:SS, 24hr format
        self.arrivalTime: str = arrivalTime
        self.departureTime: str = departureTime
        # seconds since midnight that day, like 0 -> 86,400 (60*60*24)
        self.arrivalTimeSeconds: int = hhmmssToSeconds(arrivalTime)
        self.departureTimeSeconds: int = hhmmssToSeconds(departureTime)
        self.stopSequence: str = int(stopSequence) # stop number in the sequence of stop
        self.isTimeExact: bool = timepoint=="1" # 0=approx, 1=exact

    def __str__(self):
        return ""

    def toJson(self):
        return {
            "tripId": self.tripId,
            "stopId": self.stopId,
            "arrivalTime": self.arrivalTime,
            "departureTime": self.departureTime,
            "arrivalTimeSeconds": self.arrivalTimeSeconds,
            "departureTimeSeconds": self.departureTimeSeconds,
            "stopSequence": self.stopSequence,
            "isTimeExact": self.isTimeExact
        }

class ServiceCalendar:
    serviceCalendars: dict[str, ServiceCalendar] = {} # service id, service calendar obj
    exceptions: dict[str, dict[str, bool]] = {} # date YYYYMMDD, {service id, is active}

    @classmethod
    def generateServiceCalendarsFromFile(cls, filePath: str):
        with open(filePath, "r") as f:
            data = csv.DictReader(f)
            for row in data:
                sc = ServiceCalendar(
                    row["service_id"],
                    row["monday"]=="1",
                    row["tuesday"]=="1",
                    row["wednesday"]=="1",
                    row["thursday"]=="1",
                    row["friday"]=="1",
                    row["saturday"]=="1",
                    row["sunday"]=="1",
                )
                cls.serviceCalendars[sc.id] = sc

    @classmethod
    def loadExceptions(cls, filePath: str):
        with open(filePath, "r") as f:
            data = csv.DictReader(f)
            for row in data:
                # exception types: 1=service has been added, 2=service has been removed
                dateException = cls.exceptions.get(row["date"], {})
                dateException[row["service_id"]] = row["exception_type"]=="1" # service has been added so set it to true
                cls.exceptions[row["date"]] = dateException

    @classmethod
    def getServiceCalendarFromId(cls, serviceId: str) -> Trip:
        sc: Route = cls.serviceCalendars.get(serviceId, None)
        if sc == None: raise Exception(f"Service Calendar w/ {serviceId=} not found!!")
        return sc

    def __init__(self, serviceId, monday, tuesday, wednesday, thursday, friday, saturday, sunday):
        self.id: str = serviceId
        # do sunday first since (new Date()).getDay() returns a num 0-6, Sun -> Sat
        self.activeDays: list[bool] = [sunday, monday, tuesday, wednesday, thursday, friday, saturday]


