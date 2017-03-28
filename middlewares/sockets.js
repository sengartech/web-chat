//sockets code
module.exports.socFunc = function(req,res){

  io.on('connection', function(socket){

    socket.user = req.session.user.username;
    console.log(socket.user);

    //for popping connection message.
    socket.broadcast.emit('chat-msg', "some user connected.");

    socket.on('typing',function(){
      socket.broadcast.emit('typing',"someone is typing.");
    });

    //for showing chats.
    socket.on('chat-msg', function(msg){
      io.emit('chat-msg',msg);
    });

    //for popping disconnection message.
    socket.on('disconnect', function(){
        io.emit('chat-msg',"someone is disconnected.");
    });

  }); //end of io.on(connection).

}//end of soc function.
