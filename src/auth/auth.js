import session from 'express-session';
import dotenv from 'dotenv';
dotenv.config();

export const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    // Default: session cookie (expires when browser closes)
    // We'll override this in the login route if "remember" is checked
  }
});

export function requireAdmin(req, res, next) {
  if (req.session?.user === process.env.USERNAME) {
    return next();
  }
  res.redirect('/');
}

export async function checkCredentials(username, password) {
  if (!username || !password) {
    console.log('Username or password is empty');
    return false;
  }
  return username === process.env.USERNAME && password === process.env.PASSWORD;
  
}
