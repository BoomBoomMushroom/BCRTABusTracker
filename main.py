import gtfsData
import socket
import threading

# this will init all the data and spawn a thread to get the bus positions
fetcher = gtfsData.GTFS_DataFetcher()

def handleClient(conn: socket.socket, addr: socket._RetAddress):
    print(f"Connected by {addr}")
    conn.send(b"hello")

    while True:
        try:
            disconnectUser = False
            message: bytes = bytes()
            while True:
                try:
                    read: bytes = conn.recv(1024)
                    message += read
                    if not read:
                        # nothing to read, break
                        disconnectUser = True
                        break
                except BlockingIOError: pass
            if disconnectUser: break

            print(message)
        except ConnectionResetError:
            print(f"Client {addr} has disconnected")
            break

    conn.close()
    print(f"Connection with {addr} closed")

def startSocketServer():
    HOST = "localhost"
    PORT = 8002
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1) # Enable reuse to prevent "Address already in use" when debugging
    s.bind((HOST, PORT))
    s.listen()
    print(f"Server started on {HOST}:{PORT}")

    while True:
        # accept a connection
        conn, addr = s.accept()
        t = threading.Thread(target=handleClient, args=(conn,addr), daemon=True)
        t.start()

if __name__ == "__main__":
    startSocketServer()
