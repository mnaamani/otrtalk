/**
  * source: Fabian Jakobs
  * https://gist.github.com/443774
  */

var fs = require("fs");
var p = require("path");
var existsSync = fs.existsSync || p.existsSync;

var rmTreeSync = exports.rmTreeSync = function(path) {
    if (!existsSync(path)) return;
 
    var files = fs.readdirSync(path);
    if (!files.length) {
        fs.rmdirSync(path);
        return;
    } else {
        files.forEach(function(file) {
            var fullName = p.join(path, file);
            if (fs.statSync(fullName).isDirectory()) {
                rmTreeSync(fullName);
            } else {
                fs.unlinkSync(fullName);
            }
        });
    }
    fs.rmdirSync(path);
};
 
exports.rmTree = function(path, callback) {
    p.exists(path, function(exists) {
        if (!exists) return callback();
 
        fs.readdir(path, function(err, files) {
            if (err) return callback(err);
 
            var fullNames = files.map(function(file) { return p.join(path, file); });
            mapAsync(fullNames, fs.stat, function(err, stats) {
                var files = [];
                var dirs = [];
                for (var i=0; i<fullNames.length; i++) {
                    if (stats[i].isDirectory()) {
                        dirs.push(fullNames[i]);
                    } else {
                        files.push(fullNames[i]);
                    }
                }
                serial(files, fs.unlink, function(err) {
                    if (err) return callback(err);
 
                    serial(dirs, exports.rmTree, function(err) {
                        if (err) return callback(err);
 
                        fs.rmdir(path, callback);
                    });
                });
            });
        });
    });
};
 
var serial = function(list, async, callback) {
    if (!list.length) return callback(null, []);
    var copy = list.concat();
 
    async(copy.shift(), function handler(err) {
        if (err) return callback(err);
 
        if (copy.length) {
            async(copy.shift(), handler);
        } else {
            callback(null);
        }
    });
};
 
var mapAsync = exports.mapAsync = function(list, mapper, callback) {
    if (!list.length) return callback(null, []);
 
    var copy = list.concat();
    var map = [];
 
    mapper(copy.shift(), function handler(err, value) {
        map.push(value);
        if (copy.length) {
            mapper(copy.shift(), handler);
        } else {
            callback(null, map);
        }
    });
};
