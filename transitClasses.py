from google.transit import gtfs_realtime_pb2
from typing import Literal
import csv

OccupancyStatus = Literal["EMPTY", "MANY_SEATS_AVAILABLE", "FEW_SEATS_AVAILABLE", "STANDING_ROOM_ONLY", "CRUSHED_STANDING_ROOM_ONLY", "FULL", "NOT_ACCEPTING_PASSENGERS", "NO_DATA_AVAILABLE", "NOT_BOARDABLE"]
OccupancyStatusFromNum: list[OccupancyStatus] = ["EMPTY", "MANY_SEATS_AVAILABLE", "FEW_SEATS_AVAILABLE", "STANDING_ROOM_ONLY", "CRUSHED_STANDING_ROOM_ONLY", "FULL", "NOT_ACCEPTING_PASSENGERS", "NO_DATA_AVAILABLE", "NOT_BOARDABLE"]

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
                    row["trip_id"], row["route_id"], row["direction_id"], row["shape_id"]
                )
                cls.trips[t.id] = t

    @classmethod
    def getTripFromId(cls, tripId: str) -> Trip:
        t: Route = cls.trips.get(tripId, None)
        if t == None: raise Exception(f"Trip w/ {tripId=} not found!!")
        return t

    @classmethod
    def getAllTripsJson(cls) -> list[Trip]:
        return [t.toJson() for t in list(cls.trips.values())]

    def __init__(self, id, routeId, direction, shapeId):
        self.id: str = id
        self.routeId: str = routeId
        self.direction: str = direction # 0 is one direction (ex. outbound), and 1 is the opposite (ex. inbound)
        self.shapeId: str = shapeId # id for a geojson route shape from shapes.json

        self.route: Route = Route.getRouteFromId(self.routeId)
        self.shape: Shape = Shape.getShapeFromId(self.shapeId)

    def __str__(self):
        return self.getRoute().shortName

    def toJson(self):
        return {
            "id": self.id,
            "direction": self.direction,

            "routeId": self.routeId,
            "shapeId": self.shapeId,
            #"route": self.route.toJson(),
            #"shape": self.shape.toJson(),
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
        t: Route = cls.shapes.get(shapeId, None)
        return t

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
