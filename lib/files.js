module.exports.UserFiles = UserFiles;

var crypto = require("crypto");
var path = require("path");
var fs = require("fs");
var fs_existsSync = fs.existsSync || path.existsSync;
if(!path.sep){
        path.sep = (process.platform.indexOf("win")==0) ? "\\":"/";
}
function UserFiles (profile, buddy, VFS, password){
    if(VFS){
      this.keys =  path_vfs(profile.keys);
      this.instags =  path_vfs(profile.instags);
      this.fingerprints = profile.buddyFingerprints ? path_vfs(profile.buddyFingerprints(buddy)) : profile.fingerprints;
    }else{
      this.keys =  path_real(profile.keys);
      this.instags =  path_real(profile.instags);
      this.fingerprints = profile.buddyFingerprints ? path_real(profile.buddyFingerprints(buddy)) : profile.fingerprints;
      make_paths(this.keys);
      make_paths(this.fingerprints);
      make_paths(this.instags);
    }

    this.password = password;

    if(VFS){
        this.VFS = VFS;
        try{
            if(this.keys) VFS.importFile(this.keys,this.keys,decryptor(this.password));
            if(this.instags) VFS.importFile(this.instags);
            if(this.fingerprints) VFS.importFile(this.fingerprints,this.fingerprints,decryptor(this.password));
        }catch(E){
            console.log("Error: Loading key-store",E);
            process.exit();
        }
    }
}

UserFiles.prototype.save = function(){
    if(this.VFS){
        console.error("Saving key-store");
        try{
          if(this.keys) this.VFS.exportFile(this.keys,this.keys,encryptor(this.password));
          if(this.instags) this.VFS.exportFile(this.instags);
          if(this.fingerprints) this.VFS.exportFile(this.fingerprints,this.fingerprints,encryptor(this.password));
        }catch(E){
            console.log("Error: Saving key-store",E);
            process.exit();
        }
    }
};

function path_real(p){
  return p?p.replace(new RegExp('/', 'g'), path.sep):p;
}
function path_vfs(p){
  return p?p.replace(new RegExp(/\\/g), '/'):p;
}
function make_paths(destination){
    if(!fs_existsSync(path_real(path.dirname(destination)))) fs.mkdirSync(path_real(path.dirname(destination)));
}

function encryptor(password){
    if(!password) return undefined;
    return (function(buff){
        return encrypt(buff,password);
    });
}
function decryptor(password){
    if(!password) return undefined;
    return (function(buff){
        return decrypt(buff,password);
    });
}

//password must be a 'binary' encoded string or a buffer.
function encrypt(buf,password){
    if(!password) return buf;
    try{
        var c = crypto.createCipher('aes256', password);
        var output = c.update(buf.toString('binary'),'binary','binary')+c.final('binary');
        return (new Buffer(output,'binary'));
    }catch(e){
        console.log("Error accessing encrypted store:",e.message);
        process.exit();
    }
}

function decrypt(buf,password){
    if(!password) return buf;
    try{
        var c = crypto.createDecipher('aes256', password);
        var output = c.update(buf.toString('binary'),'binary','binary')+c.final('binary');
        return (new Buffer(output,'binary'));
    }catch(e){
        console.log("Error accessing encrypted store:",e.message);
        process.exit();
    }

}
