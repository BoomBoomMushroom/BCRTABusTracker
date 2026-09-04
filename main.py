from websocket_server import WebsocketServer
import json

import gtfsData
import transitClasses

server: WebsocketServer = None
fetcher: gtfsData.GTFS_DataFetcher = None

def onNewFeedCallback(transitFeed: transitClasses.Feed, specificClient=None):
    #print(transitFeed)
    msg = json.dumps({
        "type": "feed",
        "data": transitFeed.toJson()
    })

    if specificClient == None:
        server.send_message_to_all(msg)
    else:
        server.send_message(specificClient, msg)

def onClientJoined(client, server: WebsocketServer):
    print(f"{client['address']} has joined!")
    # inform the user of all the shapes & routes info, a static registry that is referenced by trip & vehicle data
    stopsPacket = {
        "type": "stopsInfo",
        "data": transitClasses.Stop.getAllStopsJson()
    }
    shapesPacket = {
        "type": "shapesInfo",
        "data": transitClasses.Shape.getAllShapesJson()
    }
    routesPacket = {
        "type": "routesInfo",
        "data": transitClasses.Route.getAllRoutesJson()
    }
    tripsPacket = {
        "type": "tripsInfo",
        "data": transitClasses.Trip.getAllTripsJson()
    }

    server.send_message(client, json.dumps(stopsPacket))
    server.send_message(client, json.dumps(shapesPacket))
    server.send_message(client, json.dumps(routesPacket))
    server.send_message(client, json.dumps(tripsPacket))
    if fetcher.feed != None: onNewFeedCallback(fetcher.feed)

def onClientLeft(client, server: WebsocketServer):
    print(f"{client['address']} has left!")

def onMessage(client, server: WebsocketServer, message):
    pass

if __name__ == "__main__":
    # this will init all the data and spawn a thread to get the bus positions
    fetcher = gtfsData.GTFS_DataFetcher(onNewFeedCallback) # can set it to None if we dont want callbacks

    HOST = "localhost"
    PORT = 8002
    server = WebsocketServer(host=HOST, port=PORT)
    server.set_fn_new_client(onClientJoined)
    server.set_fn_client_left(onClientLeft)
    server.set_fn_message_received(onMessage)
    print(f"Starting server at {HOST}:{PORT}")
    server.run_forever()
    
