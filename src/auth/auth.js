import session from 'express-session';
import dotenv from 'dotenv';
dotenv.config();

export const sessionMiddleware = session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
});

export function requireAdmin(req, res, next) {
  if (req.session?.user === process.env.USERNAME) {
    return next();
  }
  res.redirect('/');
}

export async function checkCredentials(username, password) {
  console.log(`Checking credentials for user: ${username}, ${process.env.USERNAME}, ${process.env.PASSWORD}`);
  if (!username || !password) {
    console.log('Username or password is empty');
    return false;
  }
  return username === process.env.USERNAME && password === process.env.PASSWORD;
  
}
