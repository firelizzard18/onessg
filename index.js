var fs = require('fs-extra');
var path = require('path');
var replaceExt=require('replace-ext');
var glob = require('glob');
var matter = require('gray-matter');
var cons = require('consolidate');
var yaml = require('js-yaml');
var marked = require('marked');
var async = require('async');
var _ = require('lodash');
// Directory vars:
var src;
var layouts;
var dist;
module.exports = function (engine, dirs, cb) {
  // Make dirs available globally
  setDirs(dirs, function (err) {
    if (err) cb(err);
  });
  // Check that engine is a string:
  if (typeof engine !== 'string' || engine === '') return cb(new Error('Please pass a valid engine parameter'));
  // Check that engine is supported by consolidate.js:
  if (typeof cons[engine] !== 'function') return cb(new Error(engine+' is not a valid consolidate.js template engine'));
  // For each file in src:
  forGlob('**/*.@(html|md|markdown)', function (filePath, cb) {
    // Load and parse FM:
    loadFile(filePath, function (err, data) {
      if (err) return cb(err);
      // Run through middleware:
      middleware(filePath, data.content, function (err, body) {
        if (err) return cb(err);
        // Overwrite body:
        data.content=body;
        // Render it:
        render(data, engine, filePath, function (err, html) {
          if (err) return cb(err);
          // Get path to write to:
          var writePath=replaceExt(path.join(dist, filePath), '.html');
          // Output using fs-extra:
          fs.outputFile(writePath, html, function (err) {
            if (err) return cb(err);
            cb();
          });
        });
      });
    });
  }, function (err) {
    cb(err);
  });
};
// HELPER FUNCTIONS
function render(data, engine, filePath, cb) {
  // Get defaults:
  getDefaults(path.join(src, filePath), function (err, defaults) {
    if (err) return cb(err);
    // Set Defaults:
    _.defaultsDeep(data.data, defaults);
    // If layout, render:
    if (data.data._layout) {
      // Get layouts/layoutName.* :
      var layout=glob.sync(path.join(layouts, data.data._layout)+'.*')[0];
      // Glob doesn't throw an error if the layout path doesn't exist, so we do:
      if (!layout) cb(new Error('The layout: '+data.data._layout+' cannot be found in '+layouts));
      var locals=data.data;
      locals._body=data.content;
      // Render with consolidate.js:
      cons[engine](layout, locals, cb);
    } else cb(null, data.content); // Else, return body
  });
}
function getDefaults(filePath, cb, defaults) {
  glob(path.join(path.dirname(filePath), '_defaults.*'), function (err, res) {
    if (err) return cb(err);
    if (!defaults) defaults={};
    if (!res[0]) return recurse();
    var ext=path.extname(res[0]);
    try {
      switch (ext) {
      case '.yaml':
      case '.yml':
        _.defaultsDeep(defaults, yaml.safeLoad(fs.readFileSync(res[0], 'utf8')));
        break;
      case '.json':
        _.defaultsDeep(defaults, fs.readJsonSync(res[0]));
      }
    } catch (e) {
      return cb(e);
    }
    recurse();
  });
  function recurse() {
    if (path.dirname(filePath)+path.sep === path.normalize(src+path.sep)) return cb(null, defaults);
    else {
      var newPath=path.dirname(filePath);
      return getDefaults(newPath, cb, defaults);
    }
  }
}
function middleware(filePath, text, cb) {
  // Check path's ext:
  switch (path.extname(filePath)) {
  case '.html':
    // noop:
    return cb(null, text);
  case '.md':
  case '.markdown':
    // Render markdown:
    return marked(text, cb);
  }
}
// loadFile() calls (err, front-matter object)
function loadFile(name, cb) {
  fs.readFile(path.join(src, name), 'utf8', function (err, res) {
    if (err) return cb(err);
    var json;
    // Use try...catch for sync front-matter:
    try {
      json=matter(res);
    } catch (e) {
      return cb(e);
    }
    cb(null, json);
  });
}
// Runs iter over each match of pattern and call cb
function forGlob(pattern, iter, cb) {
  glob(pattern, {nodir: true, cwd: src}, function (err, res) {
    if (err) return cb(err);
    async.each(res, iter, cb);
  });
  return;
}

function setDirs(dirs, cb) {
  // Check that src exists:
  fs.access(dirs.src, function (err) {
    if (err) return cb(err);
  });
  // Check that layouts exists:
  fs.access(dirs.layouts, function (err) {
    if (err) return cb(err);
  });
  src=dirs.src;
  dist=dirs.dist;
  layouts=dirs.layouts;
  cb();
}
