#!/usr/bin/env node
const fs = require('fs');
const { spawn, spawnSync } = require('child_process'); // Importing spawnSync
const util = require('util');
const blessed = require('blessed');
const contrib = require('blessed-contrib');
const figlet = require('figlet');
const asciify = require('asciify-image');
const axios = require('axios');
const path = require('path');

// Debugging
let currentAudio = null;
let isPlaying = false;
let progressBarInterval = null;
let songDuration = 0; // Song duration in seconds
let elapsedTime = 0; // Elapsed time in seconds

function log(...args) {
  const logMessage = args.map(arg => 
    typeof arg === 'object' ? util.inspect(arg, { depth: null }) : arg
  ).join(' ') + '\n';
  
  fs.appendFileSync('debug.log', logMessage);
}

async function playSong(songPath) {
  if (currentAudio) {
    currentAudio.kill();
  }

  const url = `${SERVER_URL}/songs/${encodeURIComponent(path.basename(songPath))}`;
  try {
    currentAudio = spawn('ffplay', [
      '-nodisp',
      '-autoexit',
      '-i', url
    ]);

    isPlaying = true;
    elapsedTime = 0;
    updateRecordBox(`Now playing: ${path.basename(songPath)}`);

    currentAudio.on('error', (err) => {
      console.error('Error playing audio:', err);
      updateRecordBox(`Error playing: ${path.basename(songPath)}`);
    });

    currentAudio.on('exit', (code, signal) => {
      if (code !== 0) {
        console.error(`FFplay exited with code ${code} and signal ${signal}`);
        updateRecordBox(`Playback ended: ${path.basename(songPath)}`);
      }
      isPlaying = false;
      clearInterval(progressBarInterval);
    });

    // Get song duration and start updating progress bar
    songDuration = await getSongDuration(url);
    startProgressBar();

  } catch (error) {
    console.error('Error fetching song:', error);
    updateRecordBox(`Error fetching: ${path.basename(songPath)}`);
  }
}

async function getSongDuration(url) {
  try {
    const result = spawnSync('ffprobe', [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      url
    ]);

    const duration = parseFloat(result.stdout.toString().trim());
    return isNaN(duration) ? 0 : duration;
  } catch (error) {
    console.error('Error fetching song duration:', error);
    return 0;
  }
}

function startProgressBar() {
  log('Starting progress bar');
  progressBar.setPercent(0);
  progressBarInterval = setInterval(() => {
    if (isPlaying && songDuration > 0) {
      elapsedTime += 1;
      const percent = (elapsedTime / songDuration) * 100;
      progressBar.setPercent(percent);
      log(`Updating progress bar: ${percent.toFixed(2)}%`);
      screen.render();
      if (elapsedTime >= songDuration) {
        clearInterval(progressBarInterval);
        log('Progress bar complete');
      }
    }
  }, 1000);
}

// Initialize the blessed screen
const screen = blessed.screen({
  smartCSR: true,
  title: 'BashBeatz Music Player',
  fullUnicode: true,
});
const SERVER_URL = 'http://localhost:3000';
const grid = new contrib.grid({ rows: 12, cols: 12, screen: screen });

// Sample image data (URL or local path)
const imageData = 'https://mrwallpaper.com/images/high/black-and-white-portrait-kanye-west-android-ck0mnm8mp92ba3ih.jpg'; // Replace with your image path or URL
function togglePlayPause() {
  if (currentAudio) {
    if (isPlaying) {
      currentAudio.kill('SIGSTOP');
      isPlaying = false;
      log('Paused playback');
    } else {
      currentAudio.kill('SIGCONT');
      isPlaying = true;
      log('Resumed playback');
    }
    updateRecordBox(isPlaying ? 'Playing...' : 'Paused');
  } else {
    log('No audio playing');
    updateRecordBox('No audio playing');
  }
}

// Key binding for play/pause
screen.key(['p'], function (ch, key) {
  togglePlayPause();
  updateRecordBox(isPlaying ? 'Playing...' : 'Paused');
});
// Options for asciify-image
const options = {
  fit: 'box',
  width: 40,
  height: 20,
};

// Function to convert image data to ASCII art
function loadImageToAscii(imagePath, callback) {
  asciify(imagePath, options, (err, asciified) => {
    if (err) throw err;
    callback(asciified);
  });
}

// Create a box for ASCII art
const asciiBox = grid.set(0, 0, 3, 12, blessed.box, {
  top: '0%',
  left: 'center',
  width: '100%',
  height: '25%',
  content: figlet.textSync('BashBeatz', { horizontalLayout: 'full' }),
  tags: true,
  style: {
    fg: 'magenta',
    bg: 'black',
    border: {
      fg: '#f0f0f0',
    },
    hover: {
      bg: 'magenta',
    },
  },
  border: {
    type: 'line',
  },
  align: 'center',
  valign: 'middle',
});

// Append the ASCII art box to the screen
screen.append(asciiBox);

// Function to fetch songs
async function fetchMusic() {
  try {
    const response = await axios.get(`${SERVER_URL}/songs`);
    const data = response.data;
    const musicdata = {
      extended: true,
      children: {}
    };
    data.forEach(item => {
      if (item.file && item.metadata) {
        const artist = item.metadata.artist || 'Unknown Artist';
        const album = item.metadata.album || 'Unknown Album';
        const title = item.metadata.title || path.basename(item.file);
        const year = item.metadata.year;

        if (!musicdata.children[artist]) {
          musicdata.children[artist] = {
            name: artist,
            extended: false,
            children: {}
          };
        }

        if (!musicdata.children[artist].children[album]) {
          musicdata.children[artist].children[album] = {
            name: album,
            extended: false,
            children: {}
          };
        }

        if (!musicdata.children[artist].children[album].children[title]) {
          musicdata.children[artist].children[album].children[title] = {
            name: title,
            file: item.file
          };
        }
      } else if (item.type === 'directory') {
        const dirName = path.basename(item.name);
        musicdata.children[dirName] = {
          name: dirName,
          children: {}
        };
      }
    });

    tree.setData(musicdata);
    screen.render();
  } catch (err) {
    console.log('Error in fetching music data:', err);
  }
}

// Create a Table for displaying the songs
var table = grid.set(3, 3, 8, 6, contrib.table, {
  keys: true,
  fg: 'cyan',
  selectedFg: 'black',
  selectedBg: 'magenta',
  interactive: true,
  label: 'All Songs',
  width: '50%',
  height: '70%',
  border: { type: 'line', fg: 'magenta' },
  columnSpacing: 3,
  columnWidth: [16, 12, 12]
});

// Initialize the table with empty data
table.setData({
  headers: ['Title', 'Track', 'Duration'],
  data: [['No Songs Selected', '', '']]
});

// Function to update song table
function updateSongTable(albumNode) {
  const tableData = [];
  if (albumNode.children) {
    Object.values(albumNode.children).forEach(song => {
      tableData.push([song.name, song.track || 'N/A', song.duration || '00:00']);
    });
  }
  return tableData.length > 0 ? tableData : [['No Songs Selected', '', '']];
}

// Append table to the screen
screen.append(table);

// Create a Tree for displaying Artists and their albums
var tree = grid.set(3, 0, 8, 3, contrib.tree, {
  fg: "green",
  label: "Music Library",
  border: { type: 'line', fg: 'cyan' },
  style: { selected: { bg: 'blue' } }
});

screen.append(tree);

// Initial focused element
let focusedWidget = tree;
tree.focus();

function toggleFocus() {
  if (focusedWidget === tree) {
    focusedWidget = table;
    table.focus();
  } else {
    focusedWidget = tree;
    tree.focus();
  }
}

// Key binding to toggle focus
screen.key('tab', toggleFocus);

let albumInfo = {
  title: "Can't Tell Me Nothing.mp3",
  artist: "Kanye West",
  releaseDate: "2004"
}

// AL Card
const recordbox = grid.set(3, 9, 8, 3, blessed.box, {
  label: "Current Record",
  border: { type: 'line', fg: 'magenta' },
  content: `Title: ${albumInfo.title}\nArtist: ${albumInfo.artist}\nRelease Date: ${albumInfo.releaseDate}`,
});

// Append the recordbox to the screen
screen.append(recordbox);

// Function to update record box
function updateRecordBox(content) {
  recordbox.setContent(content);
  screen.render();
}

// Progress Bar for Music
// Remove or comment out this code
const progressBar = grid.set(10, 0, 2, 12, contrib.gauge, {
  style: {
    fg: 'magenta',
    bg: 'black',
    border: {
      fg: 'cyan'
    }
  },
  border: {
    type: 'line'
  },
  fill: ['magenta'],
  stroke: 'cyan',
  height: 3
});
// Remove this line if it exists
screen.append(progressBar);

// Call to fetch music data
fetchMusic();

table.rows.on('select', (item, index) => {
  const song = item.getText().trim();
  // Implement showMusicPlayer function to handle song selection
});

// Event listener for selecting a tree element
tree.on('select', (node) => {
  let tableData = [];

  try {
    if (!node.children && node.file) {
      // This is a song node
      playSong(node.file);
      updateRecordBox(`Now playing: ${node.name}`);
      tableData.push([node.name, node.track || 'N/A', '00:00']);
    } else if (node.children && Object.keys(node.children).length > 0) {
      updateRecordBox(`Artist: ${node.name}`);
      tableData.push(['No Songs Selected', '', '']);
    } else if (isAlbumNode(node)) {
      // Handle album node
      tableData = updateSongTable(node);
      updateRecordBox(`Artist: ${node.parent.name}, Album: ${node.name}`);
    } else {
      tableData.push(['No Songs Selected', '', '']);
      updateRecordBox(`Unknown selection: ${node.name}`);
    }

    table.setData({
      headers: ['Title', 'Track', 'Duration'],
      data: tableData
    });

    screen.render();
  } catch (error) {
    updateRecordBox(`Error: ${error.message}`);
    table.setData({
      headers: ['Title', 'Track', 'Duration'],
      data: [['Error', '', '']]
    });
    screen.render();
  }
});

// Add key event listeners for play/pause
screen.key(['p'], function (ch, key) {
  togglePlayPause();
  updateRecordBox(isPlaying ? 'Playing...' : 'Paused');
});

// Add a key event listener to quit the application
screen.key(['escape', 'q', 'C-c'], function (ch, key) {
  return process.exit(0);
});

// Render the screen
screen.render();
