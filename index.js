require('dotenv').config()
const util = require('util')
const fs = require('fs')
var express = require('express');
const bodyParser = require('body-parser');
const session = require('express-session'); // allow us to save a user's data when they're browsing the website
const bcrypt = require('bcrypt'); // for use with username and password
const axios = require('axios');
const {useEffect} = require('react');
const {useState} = require('react');
const mysql = require('mysql2');
const app = express();
const crypto = require('crypto');
const { error } = require('console');
const path = require('path')
var favicon = require('serve-favicon')
const paypal = require('@paypal/checkout-server-sdk')
const Environment = paypal.core.SandboxEnvironment;
const PayPalClient = new paypal.core.PayPalHttpClient(new Environment(process.env.PAYPAL_CLIENT_ID,process.env.PAYPAL_CLIENT_SECRET))
//get workout data
async function checkMembership(id){
  const sql = "select good_until from users where id = ? and good_until >= CURDATE()";
  const values = [id]
  const [rows, fields] = await connection.promise().query(sql, values);
  if(rows[0]){
  return true;
  }else{
    return false
  }
}
app.set('view engine', 'ejs');
app.use(bodyParser.json());

app.use(
  session({
    secret: crypto.randomBytes(64).toString('hex'),
    saveUninitialized: false,
    resave: false,
  })
);

app.use(
  bodyParser.urlencoded({
      extended: true,
  })
);
app.use(express.static('public'));
//sets favicon
app.use('/favicon.ico',express.static('public/favicon.ico'));
// create a connection to the database
const connection = mysql.createConnection({
  host: 'localhost',
  user: process.env.USERNAME,
  password: process.env.PASSWORD,
  database: 'climbing_db'
});

// connect to the database
connection.connect((err) => {
  if (err) {
    console.error('Error connecting to database: ' + err.stack);
    return;
  }

  
});
//make a helper for the register class to help check if a user or email already exist
function checkExistingUser(username, email) {
  return new Promise((resolve, reject) => {
    const sql = 'SELECT * FROM users WHERE username = ? OR email = ?';
    const values = [username, email];

    connection.query(sql, values, (error, results) => {
      if (error) {
        console.error('Error executing MySQL query: ' + error.stack);
        reject(error);
      } else {
        resolve(results.length > 0);
      }
    });
  });
}
//start function that directs you to the login page if you arn't logged in and send you to home if you are
app.get('/', (req, res) => {
  if(req.session.userId!==undefined){
    res.redirect('home');
  }else{
    res.redirect('login');
  }
});
//brings you to the register page
app.get('/register', (req, res) => {
  const errorMessage = req.session.errorMessage;
  req.session.errorMessage = null; // reset the error message after it's been displayed
  
  res.render('register', { errorMessage });
});
//request that adds user data to the table or registered data
app.post('/register', async (req, res) => {
    const username = req.body.username;
    const email = req.body.email;
    const password = req.body.password;
    const isuser = await checkExistingUser(username,email);
    if(isuser){
        req.session.errorMessage = 'Username or Email is already taken';
        res.render('register', { errorMessage: req.session.errorMessage });
    }else{
    try {
      // Hash the password using bcrypt
      const hashedPassword = await bcrypt.hash(password, 10);
  
      // Insert the new user into the database
      const sql = 'INSERT INTO users (username, email, password) VALUES (?, ?, ?)';
      const values = [username, email, hashedPassword];
  
      connection.query(sql, values, (err, result) => {
        if (err) throw err;
        req.session.userId = result.insertId;
        req.session.username = username
        res.redirect('/evaluation');
      });
    } catch (err) {
      console.error(err);
      res.status(500).send('Server error');
    }
    } 
});
//begin login
  app.get('/login', (req, res) => {
    const errorMessage = req.session.errorMessage;
    req.session.errorMessage = null; // reset the error message after it's been displayed
    
    res.render('login', { errorMessage });
  });
  // POST route to handle the login form submission
  app.post('/login', async (req, res) => {
    const { username, password } = req.body;
    
    try {
      // Get the user with the given username from the database
      const sql = 'SELECT * FROM users WHERE username = ?';
      const values = [username];
      const [rows, fields] = await connection.promise().query(sql, values);
      
      // If no user was found, display an error message
      if (rows.length === 0) {
        req.session.errorMessage = 'Invalid username or password';
        res.render('login', { errorMessage: req.session.errorMessage });
        return;
      }
      
      // Check if the password is correct
      const user = rows[0];
      const passwordMatch = await bcrypt.compare(password, user.password);
      
      if (!passwordMatch) {
        // If the password is incorrect, display an error message
        req.session.errorMessage = 'Invalid username or password';
        res.render('login', { errorMessage: req.session.errorMessage });
        return;
      }
      // If the username and password are correct, set the user ID in the session
      req.session.username=user.username;
      req.session.userId = user.id;
      res.redirect('/home');
    } catch (err) {
      console.error(err);
      res.status(500).send('Server error');
    }
  });
  //add a logout feature
  app.get('/logout',(req,res)=>{
    req.session.userId =undefined;
    res.redirect('/');
  });
  //start the home page
  app.get('/home',async (req,res)=>{
    if(req.session.userId!==undefined){
      let sql = 'select crimp, sloper, pocket, pinch from climb_info where user_id = ?';
      let values = [req.session.userId];
      let [rows, fields] = await connection.promise().query(sql, values);
      const data = rows[0];
      let divs = [];
      for(let key in data){
        divs.push([data[key],key])
      }
      divs.sort((a,b)=>a[0]-b[0])
      sql = 'select last_worked from climb_info where user_id = ?';
      values = [req.session.userId];
      [rows, fields] = await connection.promise().query(sql, values);
      if(rows[0].last_worked === divs[0][1]){
        let temp =divs[0];
        divs[0]=divs[1];
        divs[1]=temp;
      }
      res.render('home',{username: req.session.username, divs: divs});
      console.log(checkMembership(req.session.id));
    }else{
      res.redirect('/login');
    }
  });
  //gives the evaluation page
app.get('/evaluation',(req,res)=>{
  if(req.session.userId!==undefined){
    const errorMessage = req.session.errorMessage;
    req.session.errorMessage = null;
   res.render('evaluation', { errorMessage });
  }else{
    res.redirect('/login');
  }
});
//helper for async general data entry
async function update_general_climbing_info(req){
  const sql = 'SELECT overall, overhang, slab, dyno FROM climb_info WHERE user_id = ?;'
  const values = [req.session.userId]
  const [rows, fields] = await connection.promise().query(sql, values);
  let overall = rows[0].overall;
  let overhang = rows[0].overhang;
  let slab = rows[0].slab;
  let dyno = rows[0].dyno;
  if(req.body.VGrade!==undefined){overall = req.body.VGrade}
  if(req.body.slab!==undefined){slab = req.body.slab}
  if(req.body.Dyno!==undefined){dyno = req.body.Dyno}
  if(req.body.overhang!==undefined){overhang= req.body.overhang}
  const new_val = [overhang,slab,dyno,overall,req.session.userId]
  sql1 = "UPDATE climb_info SET overhang = ?, slab = ?, dyno = ?, overall = ? WHERE user_id = ?;"
  await connection.promise().query(sql1, new_val);
}
app.post('/submit-rating',async(req,res)=>{
  if(req.body.VGrade !== undefined){
    update_general_climbing_info(req);
  }else{
    const errorMessage = req.session.errorMessage;
    req.session.errorMessage = "Please at least enter a V-Grade"; // reset the error message after it's been displayed
    res.redirect('evaluation');
    return;
  }
  if(req.body.holds === undefined || req.body.holds == '0'){
    res.redirect('/home')
  }else{
    res.redirect('/holdpage')
  }
});
app.get('/holdpage',(req,res)=>{
  if(req.session.userId!==undefined){
    const errorMessage = req.session.errorMessage;
    req.session.errorMessage = null;
   res.render('holdpage', { errorMessage });
  }else{
    res.redirect('/login');
  }
})
async function update_holds(req){
  const sql = 'SELECT crimp, sloper, pocket, pinch FROM climb_info WHERE user_id = ?;'
  const values = [req.session.userId]
  const [rows, fields] = await connection.promise().query(sql, values);
  
  let crimp = rows[0].crimp;
  let sloper = rows[0].sloper;
  let pocket = rows[0].pocket;
  let pinch = rows[0].pinch;
  if(req.body.crimps!==undefined){crimp = req.body.crimps}
  if(req.body.slopers!==undefined){sloper = req.body.slopers}
  if(req.body.pockets!==undefined){pocket = req.body.pockets}
  if(req.body.pinches!==undefined){pinch= req.body.pinches}
  const new_val = [crimp,sloper,pocket,pinch,req.session.userId]
  
  sql1 = "UPDATE climb_info SET crimp = ?, sloper = ?, pocket = ?, pinch = ? WHERE user_id = ?;"
  connection.promise().query(sql1, new_val);
}
app.post('/submit-holds', (req,res)=>{
  if(req.session.userId!==undefined){
  update_holds(req);
  res.redirect('/home');
  }
  else{
    res.redirect('/login');
  }

});
app.post('/learn',(req,res)=>{
  if(req.session.userId!==undefined){
    res.render('learn',{focus:req.body.id, username:req.session.username});
    }
    else{
      res.redirect('/login');
    }
})
app.post('/train',async(req,res)=>{
  if(req.session.userId!==undefined){
    var sql = 'SELECT overall, '
    if(req.body.id=='crimp'){
      sql=sql+'crimp'
    }else if(req.body.id=='sloper'){
      sql=sql+'sloper'
    }else if(req.body.id=='pocket'){
      sql=sql+'pocket'
    }else if(req.body.id=='pinch'){
      sql=sql+'pinch'
    }
    sql=sql+' FROM climb_info WHERE user_id = ?;'
    const values = [req.session.userId]
    const [rows, fields] = await connection.promise().query(sql, values);
    if(rows[0][req.body.id] <= 1){
      rows[0]['overall']=rows[0]['overall']-1;
    }else if(rows[0][req.body.id] >= 5){
      if(rows[0]['overall'] <5){
        rows[0]['overall']=rows[0]['overall']+1;
      }
    }
    const arr_workouts = get_workout_array(req.body.id)
    console.log(arr_workouts)
    res.render('train',{username: req.body.username, type: req.body.id, grade:rows[0]['overall']});
    }
    else{
      res.redirect('/login');
    }
})
//render payment page
app.get('/payment',(req,res)=>{
  if(req.session.userId!==undefined){
    res.render('payment', {clientID: process.env.PAYPAL_CLIENT_ID});
  }
  else{
    res.redirect('/login');
  }
})
app.post('/create-order', async (req, res) => {
  if(req.session.userId!==undefined){
  const request = new paypal.orders.OrdersCreateRequest();
  const total = 6;
  request.prefer("return=representation");
  request.requestBody({
    intent: 'CAPTURE',
    purchase_units: [
      {
        amount:{
          currency_code: 'USD',
          value: total * req.body.items.length,
          breakdown: {
            item_total: {
              currency_code: "USD",
              value: total * req.body.items.length
            }
          }
        },
        items: req.body.items.map(item => ({
          name: 'Membership to Climbing Buddy',
          unit_amount: {
            currency_code: "USD",
            value: total
          },
          quantity: 1
        }))
      }
    ]
  });
  console.log(request);
  try {
    const order = await PayPalClient.execute(request);
    res.json({ id: order.result.id });
    
  } catch (err) {
    res.status(505).json({ error: err.message });
  }
}else{
  res.redirect('/login')
}
});
app.get('/handle_success', async (req,res)=>{
  const username = req.session.userId;
  const sql = "update users set good_until = DATE_ADD(CURDATE(), interval 1 MONTH) where id = ?";
  const values = [req.session.userId]
  const [rows, fields] = await connection.promise().query(sql, values);
  res.redirect('/home');
})







  //custom error for page not found
  app.use(function(req, res, next) {
    res.status(404);
    res.locals.is_user = req.session.userId; // pass username as a local variable
    res.render('404');
  });
app.listen(3000, () => {
    console.log('Server is running on port 3000');
});
process.on('SIGINT', function() {
  console.log('Closing database connection...');
  
  // close the database connection
  connection.end(function(err) {
    if (err) {
      console.error(err);
      process.exit(1);
    }
    console.log('Database connection closed.');
    process.exit();
  });
});