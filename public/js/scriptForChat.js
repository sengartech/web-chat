//code for socket chats.
$ (function(){

  var socket = io();
  // console.log("socket is :"+socket);

  var username = $('#user').val();
  var noChat = 0; //setting 0 if all chats histroy is not loaded. 1 if all chats loaded.
  var msgCount = 0; //counting total number of messages displayed.

  //passing data on connection.
  socket.on('connect',function(){
    socket.emit('set-user-data',username);
  });

  // key press handler.
  $('#myMsg').keypress(function(){
    socket.emit('typing');
  });

  //receiving typing message.
  socket.on('typing',function(msg){
    $('#typing').text(msg);
  });

  //receiving onlineStack.
  socket.on('onlineStack',function(stack){
    $('#list').empty();
    var totalOnline = 0;
    for (var user in stack){
      var txt1 = $('<span></span>').text(user).css({"font-size":"20px"});
      var txt2;
      if(stack[user] == "Online"){
        txt2 = $('<span></span>').text(stack[user]).css({"float":"right","color":"#009933","font-size":"18px"});
        totalOnline++;
      }
      else{
        txt2 = $('<span></span>').text(stack[user]).css({"float":"right","color":"#a6a6a6","font-size":"18px"});
      }
      $('#list').append($('<li>').append(txt1,txt2));
      $('#totalOnline').text(totalOnline);
    }
    $('#scrl1').scrollTop($('#scrl1').prop("scrollHeight"));
  }); //end of receiving onlineStack.

  //emitting old-chats event while page load.
  socket.emit('old-chats',{username:username,msgCount:msgCount});

  //on scroll load more old-chats.
  $('#scrl2').scroll(function(){

    if($('#scrl2').scrollTop() == 0 && noChat == 0){
      $('#loading').show();
      socket.emit('old-chats',{username:username,msgCount:msgCount});
    }

  });

  //listening old-chats event.
  socket.on('old-chats',function(data){
    if(data.length != 0){
      for (var i = 0;i < data.length;i++) {
        $('#messages').prepend($('<li>').text(data[i].msgFrom+" : "+data[i].msg));
        msgCount++;
      }
      console.log(msgCount);
    }
    else {
      $('#noChat').show(); //displaying no more chats message.
      noChat = 1; //to prevent unnecessary scroll event.
    }
    //hiding loading bar.
    $('#loading').hide();

    //setting scrollbar position while first 9 chats loads.
    if(msgCount <= 9){
      $('#scrl2').scrollTop($('#scrl2').prop("scrollHeight"));
    }

  }); // end of listening old-chats event.

  //sending message.
  $('form').submit(function(){
    socket.emit('chat-msg',$('#myMsg').val());
    $('#myMsg').val("");
    return false;
  });

  //receiving messages.
  socket.on('chat-msg',function(msg){
    $('#messages').append($('<li>').text(msg));
    msgCount++;
    console.log(msgCount);
    $('#typing').text("");
    $('#scrl2').scrollTop($('#scrl2').prop("scrollHeight"));
  });

});//end of function.
