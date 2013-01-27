var debug = function(){};

var OTR=require("otr").OTR;
var DSA=require("otr").DSA;
var CONST=require("./otr-const.js");

var util = require('util');
var events = require('events');

exports.version = function(){
    return "arlo";
}

exports.User = User;
exports.Session = Session;
exports.POLICY = POLICY;

util.inherits(Session, events.EventEmitter);

function User( config ){
    this.name = config.name;
    this.state = {};
    this.keys = config.keys;//filename
    this.fingerprints = config.fingerprints;//filename
    var self = this;
    try{
        this.state = JSON.parse(require("fs").readFileSync(this.keys,"utf8"));
        //use DSA.inherit() to turn loaded key into instance of DSA
        Object.keys(self.state).forEach(function(k){
            console.log("loading key for account:",k);
            DSA.inherit(self.state[k]);
        });
    }catch(e){
        console.error("warning: "+e);
    }
}

User.prototype.generateKey = function(accountname,protocol,callback){
    console.log("Generating DSA key for ",accountname,protocol);
    var newKey = new DSA();
    this.state[ accountname+":"+protocol ] = newKey;
    require("fs").writeFileSync(this.keys,JSON.stringify(this.state,"utf8"));
}

User.prototype.ConnContext = function(accountname, protocol, recipient){
    return ({
        accountname:accountname,
        protocol: protocol,
        recipient: recipient
        //TODO:fingerprint
    });
}

User.prototype.writeFingerprints = function(){
}

function Session(user, context, parameters){
    events.EventEmitter.call(this);
    var self = this;
    this.user = user;
    this.context = context;
    this.parameters = parameters;

    //todo take options from parameters to pass into OTR contructor options argument
    this.ops = new OTR(this.user.state[context.accountname+":"+context.protocol],function(msg){
        //ui callback
        self.emit("message",msg);
    },function(msg){
        //io callback
        self.emit("inject_message",msg);
    },{
        "debug":false,
        "smcb":function(type,data){
            switch(type){
                case "question":
                    self.emit("smp_request",data);
                    break;
                case "abort":
                    self.emit("smp_failed");
                    break;
                case "trust":
                    self.emit("smp_complete");
                    break;
            }
        }
    });

    this.ops.secret = parameters.secret;
    this.ops.REQUIRE_ENCRYPTION = (parameters.policy & _policy['REQUIRE_ENCRYPTION'])==_policy['REQUIRE_ENCRYPTION'];    
}

Session.prototype.connect = function(){
    this.ops.sendQueryMsg();
};
Session.prototype.send = function(message){
    this.ops.sendMsg(message.toString());
};
Session.prototype.recv = function(message){
    this.ops.receiveMsg(message.toString());
};
Session.prototype.close = function(){
    this.ops.endOtr();
    this.emit("shutdown");
};
Session.prototype.start_smp = function(secret){
    var sec = secret || this.parameters? this.parameters.secret:undefined || undefined;
    if(!sec) throw( new Error("No Secret Provided"));
    this.ops.smpSecret(sec);
};
Session.prototype.respond_smp = Session.prototype.start_smp;

Session.prototype.isEncrypted = function(){
    return (this.ops.msgstate === CONST.MSGSTATE_ENCRYPTED );
};
Session.prototype.isAuthenticated = function(){
    return (this.ops.trust === true);
};

/* --- libotr-3.2.1/src/proto.h   */
var _policy = {
    'NEVER':0x00,
    'ALLOW_V1': 0x01,
    'ALLOW_V2': 0x02,
    'REQUIRE_ENCRYPTION': 0x04,
    'SEND_WHITESPACE_TAG': 0x08,
    'WHITESPACE_START_AKE': 0x10,
    'ERROR_START_AKE': 0x20
};

_policy['VERSION_MASK'] = _policy['ALLOW_V1']|_policy['ALLOW_V2'];
_policy['OPPORTUNISTIC'] =  _policy['ALLOW_V1']|_policy['ALLOW_V2']|_policy['SEND_WHITESPACE_TAG']|_policy['WHITESPACE_START_AKE']|_policy['ERROR_START_AKE'];
_policy['MANUAL'] = _policy['ALLOW_V1']|_policy['ALLOW_V2'];
_policy['ALWAYS'] = _policy['ALLOW_V1']|_policy['ALLOW_V2']|_policy['REQUIRE_ENCRYPTION']|_policy['WHITESPACE_START_AKE']|_policy['ERROR_START_AKE'];
_policy['DEFAULT'] = _policy['OPPORTUNISTIC']

function POLICY(p){  
    return _policy[p];
};
