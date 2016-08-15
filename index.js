'use strict';

const fs = require('fs');
const youtubedl = require('youtube-dl');
const colors = require('colors');
const S = require('string');
const $ = require('cheerio');
const request = require('request');
const mongoose = require('mongoose');
const Schema = mongoose.Schema;


const API_KEY = 'AIzaSyAjrnPLRyykFySLHfsrfz9SS7l8p--Rnjg';
const SEARCH_KEY = 'Big Data';
const YOUTUBE_BASE = 'https://youtube.com/';
const YOUTUBE_SEARCH_BASE = YOUTUBE_BASE+ 'results?q='+ SEARCH_KEY + '&p=';
const GOOGLE_API_BASE = 'https://www.googleapis.com/youtube/v3/videos?id='

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

//mongoose.connect('mongodb://localhost:27017/');

const snippet = mongoose.model('snippet', snippetSchema);
const pageCounter = 1;

// SEARCH QUERY ON YOUTUBE
const youtubeInitialSearch = function() {
  for (let i = 1; i < pageCounter+1; i++) {
    const crawlURL = YOUTUBE_SEARCH_BASE + i.toString();
    console.log(i, crawlURL);
    request(crawlURL, function(err, response, body) {
      if (err || response.statusCode !== 200) {
        return console.log(err);
      }
      const hyperlinks = $('a', 'li', body);
      $(hyperlinks).each(function(i, link) {
        const possibleTiny = $(link).attr('href');
        if (!possibleTiny.startsWith('/watch?v=')) {
          return console.log('[ERROR]'.red, possibleTiny, 'is not a tinyurl!');
        }
        const tinyurl = possibleTiny.split('/watch?v=')[1];
        const googleApiRequestURL = GOOGLE_API_BASE + tinyurl + '&key=' + API_KEY +
                                    '&part=snippet,contentDetails,statistics';
        console.log('[SUCCESS]'.green, googleApiRequestURL);
// USE GOOGLE API FOR VIDEO DATA
        request(googleApiRequestURL, function(err, response, body) {
          if (err || response.statusCode !== 200) {
            return console.log(err);
          }
          const googleResponse = JSON.parse(body);
          console.log(googleResponse.items[0].snippet.title);
          console.log(googleResponse.items[0].snippet.description);
          console.log(googleResponse.items[0].snippet.tags);
        });
      });
    });
  }
}

const findAllLinks = function(url) {

}

const searchRelatedVideos = function(tinyurl) {
  request(videoURL(tinyurl), function(err, response, body){
    if (err || statusCode !== 200) {
      return console.log(err);
    }

  });
}

const videoURL = function(tinyurl) {
  return YOUTUBE_BASE + '/watch?v=' + tinyurl;
}


// GET SUBFILE AND HANDLE IT
const getSubtitles = function(tinyurl) {

  youtubedl.getSubs(videoURL(tinyurl), subOpts, function(err, vttfile) {
    if (err) {
      return console.log(err);
    }

    if (!vttfile) {
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


      let currentTimecode = "";
      let previousString = "";

      splitContent.forEach(function(entry) {
        if (!entry || entry == " ") {
          return;
        }

        //NOTE: VTT SKIP HEADER, START AT FIRST TIMECODE (00:00:00.000)

        if (hasTimecode.test(entry)) {
            currentTimecode = entry;
            return;
        }

        if (previousString === entry) {
          return;
        }

        console.log("[TINYURL]\t", tinyurl);
        const timestamp = currentTimecode.replace(getStarttime, "");
        console.log("[TIMESTAMP]\t".yellow, timestamp);
        const cleanEntry = S(entry).collapseWhitespace().s;
        console.log("[CONTENT]\t".blue, cleanEntry, "\n");
        /*
        const snippet1 = new snippet({tinyurl: tinyurl, timestamp: timestamp, content: cleanEntry});
        snippet1.save(function (err, userObj) {
          if (err) {
            console.log(err);
          }
        });
        */
        previousString = entry;
        return;
      });
    });
  });
}
