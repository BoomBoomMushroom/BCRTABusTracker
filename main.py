from websocket_server import WebsocketServer
import json

import gtfsData
import transitClasses

server: WebsocketServer = None

def onNewFeedCallback(transitFeed: transitClasses.Feed):
    #print(transitFeed)
    msg = json.dumps({
        "type": "feed",
        "data": transitFeed.toJson()
    })
    server.send_message_to_all(msg)

def onClientJoined(client, server: WebsocketServer):
    print(f"{client['address']} has joined!")
    # inform the user of all the shapes & routes info, a static registry that is referenced by trip & vehicle data
    shapesPacket = {
        "type": "shapesInfo",
        "data": transitClasses.Shape.getAllShapesJson()
    }
    routesPacket = {
        "type": "routesInfo",
        "data": transitClasses.Route.getAllRoutesJson()
    }

    server.send_message(client, json.dumps(shapesPacket))
    server.send_message(client, json.dumps(routesPacket))

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
    
