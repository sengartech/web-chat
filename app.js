//including dependencies.
var express = require('express');
var app = express();
var http = require('http').Server(app);
var io = require('socket.io')(http);
var mongoose = require('mongoose');
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
var logger = require('morgan');
var session = require('express-session');
var mongoStore = require('connect-mongo')(session);
var methodOverride = require('method-override');
var path = require('path');
var fs = require('fs');
var _ = require('lodash');
var events = require('events');
var eventEmitter = new events.EventEmitter();

//including libs and middlewares.
var auth = require('./middlewares/auth.js');
var soc = require('./middlewares/sockets.js');

//declaring variables.
var port = process.env.PORT || 3000;

//logging all requests.
app.use(logger('dev'));

//connecting with database.
var dbPath = "mongodb://localhost/chatDB";
mongoose.connect(dbPath);
mongoose.connection.once('open',function(){
  console.log("Database Connection Established.");
});

//initialization of session middleware.
//storing sessions at database instead of local memory for security purpose.
app.use(session({
  name : 'sessionCookieUser',
  secret : 'sessionSecretKeyUser',
  resave : true,
  httpOnly : true,
  saveUninitialized: true,
  store : new mongoStore({mongooseConnection : mongoose.connection}),
  cookie : { maxAge : 60*60*1000 }
}));

//setting public folder as static.
app.use(express.static(path.resolve(__dirname,'./public')));

//setting views folder and using ejs engine for rendering.
app.set('views', path.resolve(__dirname,'./app/views'));
app.set('view engine', 'ejs');

//parsers for accepting inputs.
app.use(bodyParser.json({limit:'10mb',extended:true}));
app.use(bodyParser.urlencoded({limit:'10mb',extended:true}));
app.use(cookieParser());

//http method override with post having 'put'.
app.use(methodOverride(function(req,res){
  if(req.body && typeof req.body === 'object' && '_method' in req.body){
    //look in urlencoded post bodies and delete it.
    var method = req.body._method;
    delete req.body._method;
    return method;
  }
}));

//including models files.
fs.readdirSync("./app/models").forEach(function(file){
  if(file.indexOf(".js")){
    require("./app/models/"+file);
  }
});

//including controllers files.
fs.readdirSync("./app/controllers").forEach(function(file){
  if(file.indexOf(".js")){
    var route = require("./app/controllers/"+file);
    //calling controllers function and passing app instance.
    route.controller(app);
  }
});


//router for chat window.
app.get('/chat',auth.checkLogin,function(req,res){

  res.render('chat',
              {
                title:"Chat Home",
                user:req.session.user,
                chat:req.session.chat
              });
});

//using models.
var userModel = mongoose.model('User');
var chatModel = mongoose.model('Chat');

//saving chats to database.
eventEmitter.on('save-chat',function(data){

  var today = Date.now();

  var newChat = new chatModel({

    msgFrom : data.msgFrom,
    msgTo : data.msgTo,
    msg : data.msg,
    createdOn : today

  });

  newChat.save(function(err,result){
    if(err){
      console.log(err);
      res.render('message',
                  {
                    title:"Error",
                    msg:"Some Error Occured During Saving.",
                    status:500,
                    error:err,
                    user:req.session.user,
                    chat:req.session.chat
                  });
    }
    else if(result == undefined || result == null || result == ""){
      res.render('message',
                  {
                    title:"Empty",
                    msg:"Chat Is Not Saved.",
                    status:404,
                    error:"",
                    user:req.session.user,
                    chat:req.session.chat
                  });
    }
    else{
      console.log("chat saved.");
      console.log(result);
    }
  });

}); //end of saving chat.

//declaring variables for functions.
var oldChats;

//reading chat from database.
eventEmitter.on('read-chat',function(data){

  chatModel.find({})
           .sort('-createdOn')
           .skip(data.msgCount)
           .lean()
           .limit(9)
           .exec(function(err,result){
              if(err){
                console.log(err);
                res.render('message',
                            {
                              title:"Error",
                              msg:"Some Error Occured During Reading Chats.",
                              status:500,
                              error:err,
                              user:req.session.user,
                              chat:req.session.chat
                            });
              }
              else{
                //calling function which emits event to client to show chats.
                oldChats(result,data.username);
              }
            });
}); //end of reading chat from database.

var userStack = {};
var sendUserStack;

//listening for get-all-users event. creating list of all users.
eventEmitter.on('get-all-users',function(){
  userModel.find({})
           .select('username')
           .exec(function(err,result){
             if(err){
               console.log(err);
               res.render('message',
                           {
                             title:"Error",
                             msg:"Some Error Occured During Reading Users.",
                             status:500,
                             error:err,
                             user:req.session.user,
                             chat:req.session.chat
                           });
             }
             else{
               //console.log(result);
               for(var i = 0; i < result.length; i++){
                 userStack[result[i].username] = "Offline";
               }
               //console.log("stack "+Object.keys(userStack));
               sendUserStack();
             }
           });
});

var userSocket = {};

//socket related code.
//code for socket.io
io.on('connection', function(socket){

  //getting user name.
  socket.on('set-user-data',function(username){

    //storing variable.
    socket.username = username;
    userSocket[socket.username] = socket.id;

    //getting all users list.
    eventEmitter.emit('get-all-users');

    //sending all users list. and setting if online or offline.
    sendUserStack = function(){
      for(i in userSocket){
        for(j in userStack){
          if(j == i){
            userStack[j] = "Online";
          }
        }
      }
      //for popping connection message.
      io.emit('onlineStack',userStack);
    } //end of sendUserStack function.

  });

  //emits event to read old chats from database.
  socket.on('old-chats',function(data){
    eventEmitter.emit('read-chat',data);
  });

  //sending old chats to client.
  oldChats = function(result,username){
    io.to(userSocket[username]).emit('old-chats',result);
  }

  //showing msg on typing.
  socket.on('typing',function(){
    socket.broadcast.emit('typing',socket.username+" : is typing...");
  });

  //for showing chats.
  socket.on('chat-msg', function(msg){
    //emits event to save chat to database.
    eventEmitter.emit('save-chat',{msgFrom:socket.username,msgTo:"group",msg:msg,});
    //emits event to send chat msg to all clients.
    io.emit('chat-msg',socket.username+" : "+msg);
  });

  //for popping disconnection message.
  socket.on('disconnect', function(){

    // _.unset(loadedChats,socket.username);
    _.unset(userSocket,socket.username);
    userStack[socket.username] = "Offline";

    io.emit('onlineStack',userStack);
  });

}); //end of io.on(connection).


//to verify for unique username and email at signup.
//socket namespace for signup.
var ioSignup = io.of('/signup');
ioSignup.on('connection',function(socket){
  console.log("signup connected.");

  //verifying unique username.
  socket.on('checkUname',function(uname){
    userModel.find({'username':uname},function(err,result){
      if(err){
        console.log(err);
        res.render('message',
                    {
                      title:"Error",
                      msg:"Some Error Occured During Saving.",
                      status:500,
                      error:err,
                      user:req.session.user,
                      chat:req.session.chat
                    });
      }
      else{
        //console.log(result);
        if(result == ""){
          socket.emit('checkUname',1); //send 1 if username not found.
        }
        else{
          socket.emit('checkUname',0); //send 0 if username found.
        }
      }
    });
  });

  //verifying unique email.
  socket.on('checkEmail',function(email){
    userModel.find({'email':email},function(err,result){
      if(err){
        console.log(err);
        res.render('message',
                    {
                      title:"Error",
                      msg:"Some Error Occured During Saving.",
                      status:500,
                      error:err,
                      user:req.session.user,
                      chat:req.session.chat
                    });
      }
      else{
        //console.log(result);
        if(result == ""){
          socket.emit('checkEmail',1); //send 1 if email not found.
        }
        else{
          socket.emit('checkEmail',0); //send 0 if email found.
        }
      }
    });
  });

  //on disconnection.
  socket.on('disconnect',function(){
    console.log("signup disconnected.");
  });
});


//returning 404 status.
app.use(function(req,res){
  console.log("Page Not Found.");
  res.status(404).render('message',
                          {
                            title:"404",
                            msg:"Page Not Found.",
                            status:404,
                            error:"",
                            user:req.session.user,
                            chat:req.session.chat
                          });
});

//app level middleware for setting logged in user.
//app.use(auth.setLoggedInUser(req,res,next));

app.use(function(req,res,next){

	if(req.session && req.session.user){
		userModel.findOne({'email':req.session.user.email},function(err,user){

			if(user){
        req.user = user;
        delete req.user.password;
				req.session.user = user;
        delete req.session.user.password;
				next();
			}

		});
	}
	else{
		next();
	}

});//end of setLoggedInUser.

//listening app at port 3000.
http.listen(port,function(){
  console.log("Chat App started at port : 3000.");
});
