'use strict';
const ensureAsync = require('async/ensureAsync');
const eachSeries = require('async/eachSeries');
const S = require('string');

const parseContent = function(content, callback) {
  if (!content) {
    console.log("[EMPTY] ".red + "No content found.");
    return callback(null);
  }
  const snippetStore = [];
  console.log("[SUCCESS] ".green + "content found.");

  const removeTags = new RegExp(/<[^>]*>/g);
  const removePosition = new RegExp(/align:start position:0%/g);
  const hasTimecode = new RegExp(/\d*\:\d*\:\d*\.\d*\W\-->\W\d*\:\d*\:\d*\.\d*/g);
  const getStarttime = new RegExp(/\.\d*\W\-->\W\d*\:\d*\:\d*\.\d*/g);

  const taglessContent = content.replace(removeTags, "");
  const finalContent = taglessContent.replace(removePosition, "");
  const splitContent = finalContent.split("\n");


  let currentTimecode = "";
  let previousString = "";

  eachSeries(splitContent, ensureAsync(function(entry, cb) {
    if (!entry || entry == " ") {
      return cb(null);
    }

    //NOTE: VTT SKIP HEADER, START AT FIRST TIMECODE (00:00:00.000)

    if (hasTimecode.test(entry)) {
    // RangeError: Maximum call stack size exceeded
      currentTimecode = entry;
      return cb(null);
    }

    if (previousString === entry) {
      return cb(null);
    }

    //console.log("[TINYURL]\t", tinyurl);
    const timestamp = currentTimecode.replace(getStarttime, "");
    const cleanTimestamp = S(timestamp).stripRight().s;
    //console.log("[TIMESTAMP]\t".yellow, cleanTimestamp);
    const cleanEntry = S(entry).collapseWhitespace().s;
    //console.log("[CONTENT]\t".blue, cleanEntry, "\n");
    if (cleanTimestamp && cleanEntry) {
      snippetStore.push({timestamp: cleanTimestamp, content: cleanEntry});
    }

    previousString = entry;
    return cb(null);
  }), function (err) {
      return err ? callback(err, null) : callback(null, snippetStore);
  });
}

exports.parseContent = parseContent;
