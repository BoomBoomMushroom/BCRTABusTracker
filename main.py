from websocket_server import WebsocketServer
import json
import sys

import gtfsData
import transitClasses

server: WebsocketServer = None
fetcher: gtfsData.GTFS_DataFetcher = None
restartServer: bool = False

def onNewFeedCallback(transitFeed: transitClasses.Feed, specificClient=None):
    if server == None: return # no server to send to

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
    fetcher.clientCount += 1
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
    if fetcher.feed != None: onNewFeedCallback(fetcher.feed, client)

def onClientLeft(client, server: WebsocketServer):
    fetcher.clientCount -= 1
    address = "UNKNOWN"
    try: address = client['address']
    except: pass
    print(f"{address} has left!")

def onMessage(client, server: WebsocketServer, message):
    pass

def startWebsocketServer():
    global server

    HOST = "0.0.0.0"
    PORT = 8002
    server = WebsocketServer(host=HOST, port=PORT)
    server.set_fn_new_client(onClientJoined)
    server.set_fn_client_left(onClientLeft)
    server.set_fn_message_received(onMessage)
    print(f"Starting server at {HOST}:{PORT}")

    server.handle_error = errorHandler
    server.run_forever()


def errorHandler(request, client_address):
    global server, fetcher, restartServer
    # original handle_error code
    print('-'*40, file=sys.stderr)
    print('Exception occurred during processing of request from',
        client_address, file=sys.stderr)
    import traceback
    traceback.print_exc()
    print('-'*40, file=sys.stderr)
    # original handle_error code done
    
    restartServer = True
    try:
        server.shutdown_gracefully() # gracefully so the clients know we have closed the socket
    except: pass # server is noen probably, so uhhh, ignore ts
    server = None
    fetcher.clientCount = 0

if __name__ == "__main__":
    # this will init all the data and spawn a thread to get the bus positions
    fetcher = gtfsData.GTFS_DataFetcher(onNewFeedCallback) # can set it to None if we dont want callbacks

    while True:
        restartServer = False
        try:
            startWebsocketServer()
        except Exception as e:
            print(f"Server crashed {e}")
            restartServer = True

        if restartServer == False: break

        print("Restarting server...")


