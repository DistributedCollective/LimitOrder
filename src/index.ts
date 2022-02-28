import express from 'express';
import IO from 'socket.io';
import http from 'http';
import config from './config';
import * as main from './Main';

const app = express();
const server = http.createServer(app);
const io = new IO.Server(server);

app.use('/', express.static('public/dist'));

server.listen(config.serverPort, () => {
    console.log('listening on *:' + config.serverPort);
});
main.start(io);