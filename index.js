'use strict';

const fs = require('fs');
const search = require('youtube-search');
const youtubedl = require('youtube-dl');
const colors = require('colors');
const S = require('string');

const mongoose = require('mongoose');
const Schema = mongoose.Schema;


const API_KEY = 'AIzaSyAjrnPLRyykFySLHfsrfz9SS7l8p--Rnjg';
const SEARCH_KEY = 'Big Data';

const opts = {
  maxResults: 30,
  key: API_KEY
};

const subOpts = {
  auto: true,
  lang: 'en',
  cwd: __dirname
};

const snippetSchema = new Schema({
  tinyurl:  String,
  timestamp: String,
  content: {type: String, index: true, unique: true}
}).index({content: 'text'});

mongoose.connect('mongodb://localhost:27017/');

const snippet = mongoose.model('snippet', snippetSchema);


const looper = function (result, i, callback) {
  const entry = result[i];

  youtubedl.getSubs(url, subOpts, (err, files) => {
    if (i < result.length - 1) {

      looper(result, i + 1, callback);
    }
    else {
      return callback(null);
    }
  });

  looper(result, 0, (err) => {
    console.log('ALL DONE!');
  });
}

console.log("\nXXXXXXXXXXX\n")
// search for youtube videos
search(SEARCH_KEY, opts, function(err, result) {
  if (err) {
    console.log(err);
    return;
  }

  if (!result) {
    return console.log("No result!".red);
  }

  result.forEach(function(entry) {
    if (entry["id"].length != 11) {
      return console.log("[ERROR] ".red + "Not a Tinyurl!");
    }

    const tinyurl = entry["id"];
    const title = entry["title"];
    const description = entry["description"];
    const url = "https://youtube.com/watch?v=" + tinyurl;

    console.log("[URL] ".yellow + url);
    console.log("[TINYURL] ".green + tinyurl);
    console.log("[TITLE] ".green + title);
    console.log("[DESCRIPTION] ".green + description);

    console.log("\n==========\n");


    youtubedl.getSubs(url, subOpts, function(err, vttfile) {
      if (err) {
        return console.log(err);
      }

      if (vttfile == "" || null) {
        return console.log("[EMPTY] ".red + "No sub found.");
      }

      console.log('[SUB] '.green + vttfile);
      fs.readFile(__dirname + "/" + vttfile, {encoding: 'utf-8'}, function (err, content) {
        if (err) {
          return console.log(err);
        }
        if (!content) {
          return console.log("[EMPTY] ".red + "No content found.");
        }
        console.log("[SUCCESS] ".green + "content found.");
        //console.log('[CONTENT] '.green + content);
        //console.log(content.length);
        const removeTags = new RegExp(/<[^>]*>/g);
        const removePosition = new RegExp(/align:start position:0%/g);
        const hasTimecode = new RegExp(/\d*\:\d*\:\d*\.\d*\W\-->\W\d*\:\d*\:\d*\.\d*/g);
        const getStarttime = new RegExp(/\.\d*\W\-->\W\d*\:\d*\:\d*\.\d*/g);

        const taglessContent = content.replace(removeTags, "");
        const finalContent = taglessContent.replace(removePosition, "");
        const splitContent = finalContent.split("\n");

        const subs = [];

        let timecodeStart = false;
        let currentTimecode = "";
        let previousString = "";
        let previousTimecode = "";

        splitContent.forEach(function(entry) {
          if (!entry || entry == " ") {
            return;
          }

          if (!timecodeStart === true) {
            if (hasTimecode.test(entry)) {
              currentTimecode = entry;
              timecodeStart = true;
              return;
            } else {
              return;
            }
          }

          if (!hasTimecode.test(entry)) {
            if (previousString !== entry) {
              console.log("[TINYURL]\t", tinyurl);
              const timestamp = currentTimecode.replace(getStarttime, "");
              console.log("[TIMESTAMP]\t".yellow, timestamp);
              const cleanEntry = S(entry).collapseWhitespace().s;
              console.log("[CONTENT]\t".blue, cleanEntry, "\n");
              const snippet1 = new snippet({tinyurl: tinyurl, timestamp: timestamp, content: cleanEntry});
              snippet1.save(function (err, userObj) {
                if (err) {
                  console.log(err);
                }
              });
              previousString = entry;
            }
          } else {
            currentTimecode = entry;
          }
        });
      });
    });
  });
});
