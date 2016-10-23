/**
 * Sample code accessing a brand.ai design library and analyzing text against the language definition
 * in the given library.
 * To minimize dependencies this file contains a few concerns
 *    http fetching: fetchDesignLibrary()
 *    building renderable results: getMatchesWithSurroundingText()
 *    text analysis: getIssues()
 * */
var brandai = brandai || {};

brandai.Language = function(organizationName, libraryName, libraryKey) {
  this.organizationName = organizationName;
  this.libraryName = libraryName;
  // private design libraries can be shared using a key
  this.key = libraryKey;
  this.library = null;

  var _analyze = function(text, callback) {
    fetchDesignLibrary(function(err, library) {
      if (err) {
        return callback(err);
      }
      if (library) {
        var result = {
          words: getIssues(library.termSections, [{ text: text }])
            .map(function(textBlock) {
              return {
                matches: getMatchesWithSurroundingText(textBlock.wordList, textBlock.match)
              };
            })
        };
        return callback(null, result);
      }
    }.bind(this));
  }.bind(this);

  var fetchDesignLibrary = function(callback) {
    if (this.library) {
      return callback(null, this.library)
    }
    var url = 'https://api.brand.ai/styleguide/' + this.organizationName + '/' + this.libraryName;
    if (this.key) {
      url += '?key=' + this.key;
    }
    //var url = 'http://localhost:3001/styleguide/' + this.organizationName + '/' + this.libraryName;
    var xhr = new XMLHttpRequest();
    xhr.onload = function() {
      if (xhr.status === 200) {
        if (xhr.response) {
          var response = JSON.parse(xhr.response);
          if (response.success) {
            this.library = response.result;
            return callback(null, response.result);
          }
        }
      } else {
        return callback('Error fetching design library. http status: ' + xhr.status);
      }
    }.bind(this);

    xhr.onerror = function() {
      return callback('could not send request to the server');
    };

    xhr.open('GET', url, true);

    xhr.setRequestHeader("Content-Type", 'application/json');
    xhr.send();
  }.bind(this);

  const MATCH_PADDING_CHARS = 40;
  function getMatchesWithSurroundingText(words, match) {
    var matches = [];
    words.forEach((value, index) => {
      if (value === match) {
        matches.push(index);
      }
    });

    return matches.map((value, index) => {
      let preText = '';
      let postText = '';

      // go backwards until threshold or previous occurrence
      let i = value - 1;
      while (i >= 0 && preText.length <= MATCH_PADDING_CHARS) {
        // don't overlap with previous match
        if (index - 1 >= 0 && i <= matches[index - 1]) {
          break;
        }
        preText = `${words[i]} ${preText}`;
        i--;
      }

      // go forward until threshold or next occurrence
      i = value + 1;
      while (i < words.length && postText.length <= MATCH_PADDING_CHARS) {
        // don't overlap with next match
        if (index + 1 <= matches.length && i >= matches[index + 1]) {
          break;
        }
        postText += words[i] + ' ';
        i++;
      }
      return { preText, match: words[value], postText };
    });
  }

  function getIssues(termSections, textBlocks) {
    var issues = [];
    var termsByMisspelling = getTermsByMisspellingMap(termSections);
    var wordsToAvoidMap = getWordsToAvoidMap(termSections);

    textBlocks.forEach(textBlock => {
      let processed = {};
      var words = getWordList(textBlock);
      let normalizedWords = words.map(word => normalizeTerm(word));
      normalizedWords.forEach(word => {
        if (processed[word]) {
          return;
        }
        processed[word] = {};
        if (termsByMisspelling[word]) {
          issues.push({
            type: 'common',
            text: textBlock.text,
            wordList: normalizedWords,
            match: word,
            textBlock,
            term: termsByMisspelling[word]
          });
        } else if (wordsToAvoidMap[word]) {
          issues.push({
            type: 'avoid',
            text: textBlock.text,
            wordList: normalizedWords,
            match: word,
            textBlock,
            term: wordsToAvoidMap[word]
          });
        } else {
          // nothing special about this word, do nothing
        }
      });
    });
    return issues;
  }

  function getTermsByMisspellingMap(termSections) {
    var termsByMisspelling = {};
    termSections
      .filter(section => section.intention === 'common')
      .forEach(section => {
        section.terms.forEach(term => {
          term.relatedTerms.forEach(relatedTerm => {
            // there might be cases where a single misspelled word has been defined for more than
            // one term. In this case, the last one wins
            termsByMisspelling[relatedTerm] = term;
          })
        })
      });
    return termsByMisspelling;
  }

  function getWordsToAvoidMap(termSections) {
    var wordsToAvoidMap = {};
    termSections
      .filter(section => section.intention === 'avoid')
      .forEach(section => {
        section.terms.forEach(term => {
          var parts = term.name.split(',');
          let normalizedParts = parts.map(part => normalizeTerm(part));
          normalizedParts.forEach(part => {
            wordsToAvoidMap[part] = term;
          })
        })
      });
    return wordsToAvoidMap;
  }

  function normalizeTerm(term) {
    return term && term.trim().replace(/(,|\.|:|!)/, '');
  }

  function getWordList(textBlock) {
    if (!textBlock || !textBlock.text) {
      return [];
    }
    return textBlock.text.split(' ');
  }

  return {
    analyze: _analyze
  }
};
