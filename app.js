// ===============================
// Configuration
// ===============================

// Change this to your real deployed Vercel API URL when needed
const API_BASE_URL = "https://word-game-api.vercel.app/";

// ===============================
// DOM references
// ===============================
const guessInputEl = document.getElementById("guess-input");
const submitGuessEl = document.getElementById("submit-guess");
const boardEl = document.getElementById("board");
const messageEl = document.getElementById("message");
const startButtonEl = document.getElementById("start-button");
const keyboardEl = document.getElementById("keyboard");

const gameModalEl = document.getElementById("game-modal");
const gameModalTitleEl = document.getElementById("game-modal-title");
const gameModalTextEl = document.getElementById("game-modal-text");
const playAgainButtonEl = document.getElementById("play-again-button");


// ===============================
// Game state
// ===============================


// Tracks the best-known status of each letter on the keyboard
// Example:
// {
//   a: "present",
//   b: "absent",
//   c: "correct"
// }
let letterStatuses = {};

//overall game state
let isGameOver = false;

// This will hold the secret target word from your API
let targetWord = "";

// These values define the Wordle-style board size
const ROWS = 6;
const COLS = 5;

// We will store guesses here later
let guesses = [];

// This tracks the letters the player is typing right now
let currentGuess = "";

// This tracks which row the player is currently on
let currentRow = 0;

// ===============================
// Helper functions
// ===============================

/**
 * Show the full-screen game result modal.
 */
function showGameModal(title, message) {
    gameModalTitleEl.textContent = title;
    gameModalTextEl.textContent = message;
    gameModalEl.classList.remove("hidden");
}

/**
 * Hide the game result modal.
 */
function hideGameModal() {
    gameModalEl.classList.add("hidden");
}


//KEYBOARD GUESSED WORDS DISPLAY
/**
 * Returns true if the new status is stronger / more informative
 * than the old status.
 */
function isBetterStatus(oldStatus, newStatus) {
    const rank = {
        absent: 1,
        present: 2,
        correct: 3
    };

    return (rank[newStatus] || 0) > (rank[oldStatus] || 0);
}

/**
 * Update our keyboard letter state based on a newly scored guess.
 * Letters only move upward in priority:
 * absent -> present -> correct
 */
function updateLetterStatuses(guess, score) {
    for (let i = 0; i < guess.length; i++) {
        const letter = guess[i];
        const newStatus = score[i];
        const oldStatus = letterStatuses[letter];

        if (!oldStatus || isBetterStatus(oldStatus, newStatus)) {
            letterStatuses[letter] = newStatus;
        }
    }
}



// A simple QWERTY layout for the on-screen keyboard
const KEYBOARD_ROWS = [
    ["q", "w", "e", "r", "t", "y", "u", "i", "o", "p"],
    ["a", "s", "d", "f", "g", "h", "j", "k", "l"],
    ["z", "x", "c", "v", "b", "n", "m"]
];

/**
 * Apply the current letter statuses to the on-screen keyboard.
 */
function renderKeyboard() {
    const keyEls = keyboardEl.querySelectorAll(".key");

    keyEls.forEach((keyEl) => {
        const letter = keyEl.dataset.letter;
        const status = letterStatuses[letter];

        keyEl.classList.remove("correct", "present", "absent");

        if (status) {
            keyEl.classList.add(status);
        }
    });
}

/**
 * Update the small message area at the top of the page.
 */
function setMessage(text) {
    messageEl.textContent = text;
}

/**
 * Build an empty 6x5 board in the DOM.
 * Each tile starts out blank.
 */
function createBoard() {
    // Clear out any existing board first
    boardEl.innerHTML = "";

    // Build 6 rows
    for (let rowIndex = 0; rowIndex < ROWS; rowIndex++) {
        const rowEl = document.createElement("div");
        rowEl.className = "row";

        // Build 5 tiles inside each row
        for (let colIndex = 0; colIndex < COLS; colIndex++) {
            const tileEl = document.createElement("div");
            tileEl.className = "tile";
            rowEl.appendChild(tileEl);
        }

        boardEl.appendChild(rowEl);
    }
}

/**
 * Reset the JS game state back to a fresh game.
 */
function resetGameState() {
    targetWord = "";
    guesses = [];
    currentGuess = "";
    currentRow = 0;
    letterStatuses = {};
    isGameOver = false;
}

/**
 * Ask the API for a random target word.
 */
async function fetchTargetWord() {
    const response = await fetch(`${API_BASE_URL}/api/word`);

    if (!response.ok) {
        throw new Error("Could not fetch target word from API.");
    }

    const data = await response.json();

    // We expect the API to return something like: { word: "crane" }
    return data.word;
}

/**
 * Start a new game:
 * 1. reset state
 * 2. draw empty board
 * 3. load a target word from the API
 */
async function startGame() {
    try {
        setMessage("Loading word...");
        hideGameModal();
        resetGameState();
        createBoard();
        createKeyboard();

        targetWord = await fetchTargetWord();

        // For now, log it so we can confirm everything works.
        // Later, remove this once gameplay is finished.
        console.log("Target word:", targetWord);

        setMessage("Game ready! Typing comes next.");
    } catch (error) {
        console.error(error);
        setMessage("Failed to start game.");
    }
    //shift focus automatically because extra focus click is annoying
    guessInputEl.focus();
}

/**
 * Fill a row in the board with a guessed word and apply score styling.
 *
 * Example:
 * guess = "crane"
 * score = ["absent", "present", "correct", "absent", "absent"]
 */
function renderGuess(rowIndex, guess, score) {
    const rowEl = boardEl.children[rowIndex];

    for (let i = 0; i < guess.length; i++) {
        const tileEl = rowEl.children[i];

        tileEl.textContent = guess[i];
        tileEl.classList.remove("correct", "present", "absent");
        tileEl.classList.add(score[i]);
    }
}

/**
 * Score a guess against the target word using Wordle-style rules.
 *
 * Returns an array with one result per letter:
 * - "correct" = right letter, right place
 * - "present" = right letter, wrong place
 * - "absent"  = letter not used in target
 *
 * We use a 2-pass system so duplicate letters are handled correctly.
 */
function scoreGuess(guess, target) {
    const result = Array(guess.length).fill("absent");
    const remainingTargetLetters = target.split("");

    for (let i = 0; i < guess.length; i++) {
        if (guess[i] === target[i]) {
            result[i] = "correct";
            remainingTargetLetters[i] = null;
        }
    }

    for (let i = 0; i < guess.length; i++) {
        if (result[i] === "correct") {
            continue;
        }

        const guessedLetter = guess[i];
        const matchIndex = remainingTargetLetters.indexOf(guessedLetter);

        if (matchIndex !== -1) {
            result[i] = "present";
            remainingTargetLetters[matchIndex] = null;
        }
    }

    return result;
}

/**
 * Handles when the user submits a guess
 */
/**
 * Handles when the user submits a guess
 */
function handleSubmitGuess() {
    if (isGameOver) {
        return;
    }

    const guess = guessInputEl.value.toLowerCase().trim();

    // Basic validation
    if (guess.length !== 5) {
        setMessage("Guess must be 5 letters.");
        return;
    }

    if (!targetWord) {
        setMessage("Start the game first.");
        return;
    }

    if (currentRow >= ROWS) {
        setMessage("No more guesses left.");
        return;
    }

    // Score the guess against the target word
    const score = scoreGuess(guess, targetWord);
    updateLetterStatuses(guess, score);
    renderKeyboard();

    // Save the guess
    guesses.push({
        word: guess,
        score: score
    });

    // Render it to the board with coloring
    renderGuess(currentRow, guess, score);

    // Move to next row
    currentRow++;

    // Clear input
    guessInputEl.value = "";

    // WIN state
    if (guess === targetWord) {
        isGameOver = true;
        setMessage("Correct! 🎉");
        showGameModal(
            "You Won!",
            `You guessed the word "${targetWord.toUpperCase()}".`
        );
        return;
    }

    // LOSS state
    if (currentRow === ROWS) {
        isGameOver = true;
        setMessage(`Game over. Word was: ${targetWord.toUpperCase()}`);
        showGameModal(
            "You Lost",
            `The correct word was "${targetWord.toUpperCase()}".`
        );
        return;
    }

    // Otherwise continue playing
    setMessage("Try again.");
}


//Create the guessed letters "keyboard" display
/**
 * Build the on-screen keyboard from our QWERTY layout.
 */
function createKeyboard() {
    keyboardEl.innerHTML = "";

    for (const row of KEYBOARD_ROWS) {
        const rowEl = document.createElement("div");
        rowEl.className = "keyboard-row";

        for (const letter of row) {
            const keyEl = document.createElement("div");
            keyEl.className = "key";
            keyEl.dataset.letter = letter;
            keyEl.textContent = letter;

            rowEl.appendChild(keyEl);
        }

        keyboardEl.appendChild(rowEl);
    }
}

// ===============================
// Event listeners
// ===============================

startButtonEl.addEventListener("click", startGame);
submitGuessEl.addEventListener("click", handleSubmitGuess);
playAgainButtonEl.addEventListener("click", startGame);
// Allow pressing Enter to submit
guessInputEl.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
        handleSubmitGuess();
    }
});
// Draw the board once when the page first loads
createBoard();