/**
 * Creates or resets the admin login for the site.
 * Usage: node server/create-admin.js
 *
 * (You can also just visit /admin/login in the browser the first time —
 * it will offer to create an account if none exists yet. This script is
 * here for resetting a forgotten password from the command line.)
 */
const readline = require("readline");
const db = require("./db");
const auth = require("./auth");

function ask(question) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => rl.question(question, (answer) => { rl.close(); resolve(answer); }));
}

// Masks password input with asterisks instead of echoing it in plain text.
function askHidden(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const stdin = process.stdin;
    let value = "";

    process.stdout.write(question);
    stdin.setRawMode && stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    function onData(char) {
      char = char.toString();
      if (char === "\n" || char === "\r" || char === "\u0004") {
        stdin.setRawMode && stdin.setRawMode(false);
        stdin.removeListener("data", onData);
        process.stdout.write("\n");
        rl.close();
        resolve(value);
        return;
      }
      if (char === "\u0003") process.exit(1); // Ctrl+C
      if (char === "\u007f" || char === "\b") { // backspace
        value = value.slice(0, -1);
        process.stdout.write("\b \b");
        return;
      }
      value += char;
      process.stdout.write("*");
    }
    stdin.on("data", onData);
  });
}

async function main() {
  const existing = !db.anyUserExists();
  console.log(existing ? "No admin account exists yet. Let's create one.\n" : "An admin account already exists — this will reset the password.\n");

  const username = await ask("Username: ");
  if (!username.trim()) {
    console.log("Username can't be blank.");
    process.exit(1);
  }

  const password = await askHidden("Password (min 8 characters): ");
  if (password.length < 8) {
    console.log("Password must be at least 8 characters.");
    process.exit(1);
  }
  const confirm = await askHidden("Confirm password: ");
  if (password !== confirm) {
    console.log("Passwords didn't match.");
    process.exit(1);
  }

  const salt = auth.makeSalt();
  const hash = auth.hashPassword(password, salt);

  if (db.getUser(username)) {
    db.updateUserPassword(username, hash, salt);
    console.log(`\nPassword updated for "${username}".`);
  } else {
    db.createUser(username, hash, salt);
    console.log(`\nAdmin account "${username}" created.`);
  }
}

main();
