var brandai = brandai || {};

brandai.Language = function(organizationName, styleguideName) {
  this.organizationName = organizationName;
  this.styleguideName = styleguideName;
  this.styleguide = null;

  var _analyze = function(text, callback) {
    return fetchDesignLibrary(function(err, styleguide) {
      if (err) {
        throw err;
      }
      if (styleguide) {
        var analyzed = analyze(styleguide.termSections, [{ text: text }]);
        var result = [];
        analyzed.forEach(function(analyzedBlock) {
          result.push(assembleMatches(analyzedBlock.wordList, analyzedBlock.match));
        });

        return callback(result);
      }
    }.bind(this));
  }.bind(this);

  var fetchDesignLibrary = function(cb) {
    if (this.styleguide) {
      cb(null, this.styleguide)
    }
    //var url = 'https://api.brand.ai/styleguide/' + this.organizationName + '/' + this.styleguideName;
    var url = 'http://localhost:3001/styleguide/' + this.organizationName + '/' + this.styleguideName;
    var xhr = new XMLHttpRequest();
    xhr.onload = function() {
      if (xhr.status === 200) {
        if (xhr.response) {
          var response = JSON.parse(xhr.response);
          if (response.success) {
            this.styleguide = response.result;
            return cb(null, response.result);
          }
        }
      } else {
        return cb('Error fetching design library. http status: ' + xhr.status);
      }
    }.bind(this);

    xhr.onerror = function(err) {
      return cb('could not send request to the server. Error: ' + err.message);
    };

    xhr.open('GET', url, true);

    xhr.setRequestHeader("Content-Type", 'application/json');
    xhr.send();
  }.bind(this);

  /**
   * @param termSections - common words and words to avoid to analyze the items against
   * @param textBlocks - array of text blocks to analyze (see text-service.js for interface)
   * @return array of analyzed text blocks [{text, term}] (term is the relevant item from termSections)
   * The number of analyzed blocks might be larger than the number of items because we'll duplicate
   * the item for each issue found
   * */
  function analyze(termSections, textBlocks) {
    return getIssues(termSections, textBlocks);
  }

  const MATCH_PADDING_CHARS = 40;

  function assembleMatches(words, match) {
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

  function normalizeTerm(term) {
    return term && term.trim().replace(/(,|\.|:)/, '');
  }

  function getWordList(textBlock) {
    if (!textBlock || !textBlock.text) {
      return [];
    }
    return textBlock.text.split(' ');
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


  return {
    analyze: _analyze
  }
};
