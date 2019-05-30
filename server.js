var net = require('net');

var server = net.createServer(function(conn){
  console.log('server-> tcp server created');

  conn.on('data', function(data){
    console.log('server-> ' + data + ' from ' + conn.remoteAddress + ':' + conn.remotePort);
    conn.write('server -> Repeating: ' + data);
  });
  conn.on('close', function(){
    console.log('server-> client closed connection');
  });
}).listen(9222);

console.log('listening on port 9222');