var keypress = require('keypress');
var tty = require('tty');
var ansi = require('ansi');

var Session;
var Talk;
var defaultChatPrompt = 'otrtalk: ';
var SMP;
var UI;

module.exports.ActiveSession = function(){
    return Session;
}

module.exports.attach = function(talk,session){
    if(Session) return false;

    Session=session;
    Talk=talk;
    UI = new ChatConsole(defaultChatPrompt,function(txt,inputMode){
        if(!Session) return;
        switch(inputMode){
            case 1://message or command
              txt = txt.trim();
              if(!txt) return;
              switch(txt){
                case "/help":
                     console.log("available commands");
                     console.log("/auth\n/info\n/clear\n/exit");
                     return;
                case "/exit":
                case "/quit":
                case "/end":
                    endChat();
                    return;
                case "/clear":
                    //best way to clear the screen..?
                    UI.clear();
                    return;
                case "/auth": //start smp
                    if(SMP && SMP.incoming){
                        console.log("enter authentication response:");
                        return ({prompt:'[secret]: ', inputMode:4});
                    }else{
                        SMP = {outgoing:true};
                        console.log("preparing to send authentication request:");
                        return ({prompt:'[question]: ', inputMode:2});
                    }
                    return;
                case "/info"://get session info, state,ip:port (geoip),fingerprint,buddy,buddyid
                    console.log("[session "+ (session.authenticated()?"authenticated":"not authenticated!")+"]");
                    console.log("[session " +(session.encrypted()?"encrypted":"not encrypted!")+"]");
                    return;
                default:
                     if(txt[0]=='/'){
                        console.log("[unrecognised command, /help for help]");
                        return;
                     }
                     if(session.secure()){
                         session.send(txt);
                         console.log(timestamp()+" ("+talk.profile.id+") "+talk.profile.accountname+": "+txt);
                     }else endChat();//hmmm 
                     return;
               } 
               break;

              case 2://entering smp question
                SMP.question = txt ? txt.trim() : undefined;
                if(SMP.question){
                    console.log("AUTH: Question = '"+SMP.question+"'");
                }else{
                    console.log("AUTH: No question.");
                }
                return ({inputMode:3, prompt:'[secret]: '});
                
              case 3://entering smp secret to start smp request.
                SMP.secret = txt ? txt.trim() : undefined;
                if(SMP.secret){
                    console.log("[authentication request sent]");
                    SMP.question ? Session.smpq(SMP.question,SMP.secret) : Session.smp(SMP.secret);
                    return ({inputMode:100, prompt:'authenticating...'});
                }else{
                    //try again...
                    return;
                }
              case 4://entering smp secret to reply to smp request.
                SMP.response = txt ? txt.trim() : undefined;
                if(SMP.response){
                    console.log("[authentication response sent]");
                    Session.respond_smp(SMP.response);
                    return ({inputMode:100, prompt:'authenticating...'});
                }else{
                    //try again...
                    return;
                }
        }//switch input mode

    },function(){
        //callback when Ctrl-D is pressed.
        endChat();
    });
        
    session.on("message",function(msg){
         console.log(timestamp()+" ("+talk.buddy+") "+talk.buddyID+": "+msg);
    });
    session.on("smp",function(question){
         if(SMP) return;
         SMP = {incoming:true};
         console.log("[received authentication request]");
         if(question) {
            console.log("AUTH: Question = '"+question+"'");
         }else{
            console.log("AUTH: No Question was attached to request.");
         }    
         console.log("respond with the /auth command.");
    });
    session.on("auth-success",function(){
        //return chat console to inputMode 1
        SMP = undefined;
        UI.reset();
    });
    session.on("auth-failed",function(){
        //return chat console to inputMode 1
        SMP = undefined;
        UI.reset();
    });
    session.on("closed",function(){
        console.log("[chat terminating]");
    });

    function endChat(){
      process.stdin.removeAllListeners('keypress');
      process.stdin.end();
      if(Session) Session.end();
    }

    return true;
}

function ChatConsole(default_prompt, onInput, onEnd){
  var self = this;
  var buf = '';
  var inputMode = 1;//message,commands 
  var prompt = default_prompt;
  process.stdin.removeAllListeners('keypress');//be the only listener!
  keypress(process.stdin);

  var cursor = ansi(process.stdout);

  function setRawMode(mode) {
    if (process.stdin.setRawMode) {
      process.stdin.setRawMode(mode);
    } else {
      tty.setRawMode(mode);
    }
  };

  redraw_inputline();

  setRawMode(true);//will we ever leave raw mode? - yes when we close the console...

  console.log = function(X){
     X = X || '';//must be buffer or string..!
    //todo if arguments > 1 .join(" ")... cursor.write(takes only one arg)
    cursor.horizontalAbsolute(0);
    cursor.eraseLine();
    cursor.write(X+'\n');
    if(inputMode > 0) redraw_inputline();
  };

  function redraw_inputline(){
     cursor.horizontalAbsolute(0);
     cursor.eraseLine();  
     cursor.write(prompt+buf);
  }

  this.reset = function(){
        if(SMP){
             console.log("Cancelling..");
             //todo smp_abort()?
             SMP = undefined;
        }
        inputMode = 1;
        prompt = default_prompt;
        buf = '';
        redraw_inputline();
  };

  this.clear = function(){
      cursor.write(Array.apply(null, Array(process.stdout.getWindowSize()[1])).map(lf).join(''))
      .eraseData(2)
      .goto(1, 1);

       redraw_inputline();
  };

  // keypress
  process.stdin.on('keypress', function(c, key){
    if (key && 'enter' == key.name){
      var result;
      var oninput_mode = inputMode;
      process.stdin.pause();
      inputMode = 0;//if app wants to do console.log in oninput.. it can overwrite the input line
      cursor.horizontalAbsolute(0);
      cursor.eraseLine();
      if(buf.trim()){
       result = onInput( buf,oninput_mode );
       if(result){
          prompt = result.prompt ? default_prompt + result.prompt : prompt;
          inputMode = result.inputMode || oninput_mode;
       }
      }else process.stdout.write('\n');
      inputMode = inputMode || oninput_mode;

      buf='';
      redraw_inputline();
      process.stdin.resume();
      return;
    }

    if (key && key.ctrl && 'c' == key.name ) {
        self.reset();
        return;
    }

    if (key && key.ctrl && 'd' == key.name ) {
        inputMode = -1;
        cursor.write('\n');
        setRawMode(false);
        onEnd();
        return;
    }

    if(inputMode > 10) return;

    //filter out non text keypresses..
    if(c){
        if(key && (key.name||key.code)){
            if(inputMode == 1){
              if(key.ctrl) return;
              if(key.code) return;
              if(key.name){
                switch( key.name ){
                case 'backspace':
                    //remove last char from buf, redraw the input line
                    if(buf.length){
                        buf = buf.substr(0,buf.length-1);
                        redraw_inputline();
                    }
                    return;
                case 'escape':
                    buf = '';
                    redraw_inputline();
                    return;
                }
              }
            }
       }
      //mask input if entering secrets .. inputModes 3,4
      if(inputMode ==3 || inputMode==4){
           process.stdout.write("*");
      } else process.stdout.write(c);
      buf += c;
    }
  }).resume();

  return self;
};

function timestamp(){
    var d = new Date();
    return [d.getHours(),d.getMinutes()].join(":");
}

function lf () { return '\n' }
