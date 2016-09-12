'use strict';

const eachSeries = require('async/eachSeries');
const forever = require('async/forever');
const parallel = require('async/parallel');

const fs = require('fs');
const youtubedl = require('youtube-dl');
const colors = require('colors');
const S = require('string');
const $ = require('cheerio');
const makeTimestamp = require('timestamp')
const request = require('request');
const mongoose = require('mongoose');
const Schema = mongoose.Schema;


const API_KEY = 'AIzaSyAjrnPLRyykFySLHfsrfz9SS7l8p--Rnjg';
const SEARCH_KEY = 'Big Data';
const SEARCH_KEYS = ['Algorithm', 'Code', 'IT Security', 'Computer', 'Privacy', 'Data', 'Prediction', 'Cloud', 'Survaillance', 'Data Mining', 'Ubiquitous Computing', 'Industry 4.0', 'Internet of Things', 'Machine Learning', 'Social Media', 'Technology', 'Internet'];
const YOUTUBE_BASE = 'https://youtube.com/';
const YOUTUBE_SEARCH_BASE = YOUTUBE_BASE+ 'results?q='+ SEARCH_KEY + '&p=';
const getSearchBaseForIndex = (index) => {
  return YOUTUBE_BASE+ 'results?q='+ SEARCH_KEYS[index] + '&p=';
}
const GOOGLE_API_BASE = 'https://www.googleapis.com/youtube/v3/videos?id='
const AMOUNT_OF_TINYS_TO_PROCESS_IN_PARALLEL = require('os').cpus.length;

const pageCounter = 1;

const subOpts = {
  auto: true,
  lang: 'en',
  cwd: __dirname
};

const tinySchema = new Schema({
  tinyurl: {type: String, unique: true},
  title: String,
  description: String,
  timestamp: String,
  picked: Boolean,
});

const snippetSchema = new Schema({
  tinyurl:  String,
  timestamp: String,
  content: {type: String, index: true}
}).index({content: 'text'});

mongoose.connect('mongodb://127.0.0.1:27017/');

const snippet = mongoose.model('snippet', snippetSchema);
const tiny = mongoose.model('tiny', tinySchema);




// SEARCH QUERY ON YOUTUBE
const youtubeInitialSearch = function() {
  const crawl = (keywordIndex, i) => {
    const crawlURL = getSearchBaseForIndex(keywordIndex) + i.toString();
    getAllTinys(crawlURL, (err) => {
      if (err) {
        console.log(err);
      }

      // next page
      if (i < pageCounter + 1) {
        crawl(keywordIndex, i + 1);
      }
      // net keyword
      else if (keywordIndex + 1 < SEARCH_KEYS.length) {
        crawl(keywordIndex + 1, 1);
      }
      else {
        notPickedTiny();
      }
    });
  }

  crawl(0, 1);
}


const notPickedTiny = function() {
  forever((next) => {
    findOneAvialableTiny(next);
  }, (err) => {
    console.log(err);
  })
}

const findOneAvialableTiny = function (callback) {
  tiny.findOneAndUpdate({
    'picked': false}, {$set:{'picked':true}
  }, function(err, tiny) {
    if (err) {
      return callback(err);
    }
    console.log(tiny);
    searchRelatedVideos(tiny, callback);
    });

}

const searchRelatedVideos = function(tinyurl, callback) {
  getAllTinys(videoURL(tinyurl), callback);
}

const videoURL = function(tinyurl) {
  return YOUTUBE_BASE + '/watch?v=' + tinyurl;
}

const getAllTinys = function(url, callback) {
  request(url, function(err, response, body) {
    if (err || response.statusCode !== 200) {
      return callback(err);
    }

    const hyperlinks = $('a', 'li', body);

    eachLimit($(hyperlinks), AMOUNT_OF_TINYS_TO_PROCESS_IN_PARALLEL, function(link, cb) {
      const possibleTiny = $(link).attr('href');
      if (!possibleTiny.startsWith('/watch?v=')) {
        console.log('[ERROR]'.red, possibleTiny, 'is not a tinyurl!');
        return cb(null);
      }

      console.log('[SUCCES]'.green, possibleTiny);
      const tinyurl = possibleTiny.split('/watch?v=')[1];
      /*getVideoData(tinyurl, (err) => {
        if (err) {
          console.log('------');
          console.log(err);
          console.log('------');
        }

        return cb(null);
      });*/
      parallel([
        function (c) {
          saveTinyToDatabase(tinyurl, '', '', c);
        },
        function (c) {
          getSubtitles(tinyurl, c);
        },
      ], cb);
    }, callback);
  });
}

const saveTinyToDatabase = function(tinyurl, title, description, callback) {
  const tiny1 = new tiny({tinyurl: tinyurl, title: title, description: description, timestamp: makeTimestamp(), picked: false});
  tiny1.save(function (err, userObj) {
    if (err) {
      // ignore duplicate key errors
      if (err.message.indexOf('duplicate key error')) {
        return callback(null);
      }

      return callback(err);
    }
    console.log(tinyurl, 'added to mongodb.');

    return callback(null);
  });
}


const getVideoData = function(tinyurl, callback) {
  const googleApiRequestURL = GOOGLE_API_BASE + tinyurl + '&key=' + API_KEY +
                              '&part=snippet,contentDetails,statistics';
  request(googleApiRequestURL, function(err, response, body) {
    if (err || response.statusCode !== 200) {
      return callback(err);
    }
    const googleResponse = JSON.parse(body);
    const title = googleResponse.items[0].snippet.title;
    console.log(title);
    const description = googleResponse.items[0].snippet.description;
    //const tags = googleResponse.items[0].snippet.tags;
    if (!title.indexOf(SEARCH_KEY)) {
      if (!description.indexOf(SEARCH_KEY)) {
        return callback(new Error('no SEARCH_KEY found in VIDEODATA.'));
      }
    }
    saveTinyToDatabase(tinyurl, title, description, callback);
  });
}


// DOWNLOAD SUBFILE AND HANDLE IT
const getSubtitles = function(tinyurl, callback) {
  youtubedl.getSubs(videoURL(tinyurl), subOpts, function(err, vttfile) {
    if (err) {
      console.log(err);
      return callback(null);
    }

    if (!vttfile || S(vttfile).isEmpty()) {
      console.log("[EMPTY] ".red + "No sub found.");
      return callback(null);
    }

    console.log('[SUB] '.green + vttfile);
    fs.readFile(__dirname + "/" + vttfile, { encoding: 'utf-8' }, function (err, content) {
      if (err) {
        console.log(err);
        return callback(null);
      }

      if (!content) {
        console.log("[EMPTY] ".red + "No content found.");
        return callback(null);
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

      eachSeries(splitContent, function(entry, cb) {
        if (!entry || entry == " ") {
          return cb(null);
        }

        //NOTE: VTT SKIP HEADER, START AT FIRST TIMECODE (00:00:00.000)

        if (hasTimecode.test(entry)) {
            currentTimecode = entry;
            return cb(null);
        }

        if (previousString === entry) {
          return cb(null);
        }

        console.log("[TINYURL]\t", tinyurl);
        const timestamp = currentTimecode.replace(getStarttime, "");
        console.log("[TIMESTAMP]\t".yellow, timestamp);
        const cleanEntry = S(entry).collapseWhitespace().s;
        console.log("[CONTENT]\t".blue, cleanEntry, "\n");

        const snippet1 = new snippet({tinyurl: tinyurl, timestamp: timestamp, content: cleanEntry});
        snippet1.save(function (err, userObj) {
          if (err) {
            console.log(err);
            return cb(null);
          }

          cb(null);
        });

        previousString = entry;
      }, callback);
    });
  });
}


youtubeInitialSearch();
