require('dotenv').config()
const sql_login = require('./sql_login.json')
console.log(sql_login)
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
const Environment = paypal.core.LiveEnvironment;
const PayPalClient = new paypal.core.PayPalHttpClient(new Environment(process.env.PAYPAL_CLIENT_ID,process.env.PAYPAL_CLIENT_SECRET))
//get workout data
async function checkMembership(req){
  const sql = "select good_until from users where id = ? and good_until > CURDATE()";
  const values = [req.session.userId]
  const [rows, fields] = await req.Connection.promise().query(sql, values);
  if(rows[0]!==undefined){
  return true;
  }else{
  }
}
app.set('view engine', 'ejs');
app.use(bodyParser.json());
app.use(
  bodyParser.urlencoded({
      extended: true,
  })
);
app.use(
  session({
    secret: crypto.randomBytes(64).toString('hex'),
    saveUninitialized: false,
    resave: false,
  })
);
app.use(express.static('public'));
//sets favicon
app.use('/favicon.ico',express.static('public/favicon.ico'));
// create a connection to the database
const pool = mysql.createPool({
  connectionLimit: 10, // Adjust this value based on your application's needs
  host: '127.0.0.1',
  user: sql_login.username,
  password: sql_login.password,
  database: 'climbing_db'
});
// connect to the database
function getConnection() {
  return new Promise((resolve, reject) => {
    pool.getConnection((err, connection) => {
      if (err) {
        reject(err);
      } else {
        resolve(connection);
      }
    });
  });
}
app.use(async (req, res, next) => {
  try {
    const connection = await getConnection();
    req.Connection = connection;
    next();
  } catch (err) {
    console.error('Error acquiring database connection:', err);
    res.status(500).send('Internal Server Error');
  }
});
app.use((req, res, next) => {
  if (req.Connection) {
    req.Connection.release();
  }
  next();
});









//make a helper for the register class to help check if a user or email already exist
function checkExistingUser(username, email,req) {
  return new Promise((resolve, reject) => {
    const sql = 'SELECT * FROM users WHERE username = ? OR email = ?';
    const values = [username, email];

    req.Connection.query(sql, values, (error, results) => {
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
    res.redirect('info');
  }
});
app.get('/info',(req,res)=>{
  res.render('info')
})
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
    const isuser = await checkExistingUser(username,email,req);
    if(isuser){
        req.session.errorMessage = 'Username or Email is already taken';
        res.render('register', { errorMessage: req.session.errorMessage });
    }else{
    try {
      // Hash the password using bcrypt
      const hashedPassword = await bcrypt.hash(password, 10);
  
      // Insert the new user into the database
      const currentDate = new Date();
      const year = currentDate.getFullYear();
      const month = String(currentDate.getMonth() + 1).padStart(2, '0');
      const day = String(currentDate.getDate()).padStart(2, '0');
      const formattedDate = `${year}-${month}-${day}`;
      const sql = 'INSERT INTO users (username, email, password, good_until) VALUES (?, ?, ?,DATE_ADD(CURDATE(), interval 7 DAY))';
      const values = [username, email, hashedPassword, formattedDate];
  
      req.Connection.query(sql, values, (err, result) => {
        if (err) throw err;
        req.session.userId = result.insertId;
        req.session.username = username
        req.session.errorMessage = undefined;
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
      const [rows, fields] = await req.Connection.promise().query(sql, values);
      
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
      req.session.errorMessage = undefined;
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
    const Membershipexpired = await checkMembership(req);
    if(req.session.userId!==undefined && Membershipexpired){
      
      let sql = 'select endurance, flexibility, strength from climb_info where user_id = ?';
      let values = [req.session.userId];
      let [rows, fields] = await req.Connection.promise().query(sql, values);
      const data = rows[0];
      let divs = [];
      for(let key in data){
        divs.push([data[key],key])
      }
      divs.sort((a,b)=>a[0]-b[0])
      divs.push([10000,"Overall"])
      
      res.render('home',{username: req.session.username, divs: divs});
      
    }else if(req.session.userId===undefined){
      res.redirect('/login');
    }else{
      res.redirect('/payment')
    }
  });
  //gives the evaluation page
app.get('/evaluation',async (req,res)=>{
  
  if(req.session.userId!==undefined){
    const errorMessage = req.session.errorMessage;
    req.session.errorMessage = undefined;
   res.render('evaluation', { errorMessage });
  }else if(req.session.userId===undefined){
    res.redirect('/login');
  }
});
//helper for async general data entry
async function update_general_climbing_info(req){
  const sql = 'SELECT overall, overhang, slab, dyno FROM climb_info WHERE user_id = ?;'
  const values = [req.session.userId]
  const [rows, fields] = await req.Connection.promise().query(sql, values);
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
  await req.Connection.promise().query(sql1, new_val);
}
app.post('/submit-rating',async(req,res)=>{
  if(req.session.userId!==undefined){
    update_general_climbing_info(req);
  }else{
    const errorMessage = req.session.errorMessage;
    req.session.errorMessage = "Please at least enter a V-Grade"; // reset the error message after it's been displayed
    res.redirect('evaluation');
    return;
  }
  req.session.errorMessage = undefined;
  if(req.body.holds === undefined || req.body.holds == '0'){
  
    res.redirect('/home')
  }else if(req.session.userId===undefined){
    res.redirect('/login');
  }else{
    res.redirect('/holdpage')
  }
});
app.get('/holdpage',async (req,res)=>{
  
  if(req.session.userId!==undefined){
    const errorMessage = req.session.errorMessage;
    req.session.errorMessage = null;
   res.render('holdpage', { errorMessage });
  }else if(req.session.userId===undefined){
    res.redirect('/login');
  }
})
async function update_holds(req){
  console.log(req.body)
  const sql = 'SELECT endurance, strength, flexibility FROM climb_info WHERE user_id = ?;'
  const values = [req.session.userId]
  const [rows, fields] = await req.Connection.promise().query(sql, values);
  
  let endurance = rows[0].endurance;
  let strength = rows[0].strength;
  let flexibility = rows[0].flexibility;
  if(req.body.Endurance!==undefined){endurance= req.body.Endurance}
  if(req.body.Strength!==undefined){ strength = req.body.Strength}
  if(req.body.Flexibility!==undefined){flexibility = req.body.Flexibility}
  const new_val = [endurance,strength,flexibility,req.session.userId]
  
  sql1 = "UPDATE climb_info SET endurance = ?, strength = ?, flexibility = ? WHERE user_id = ?;"
  req.Connection.promise().query(sql1, new_val);
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
app.get('/learn',async(req,res)=>{
  const Membershipexpired = await checkMembership(req);
  if(req.session.userId!==undefined && Membershipexpired){
    other=[]
    moves=[]
    hooks=[]
    placement=[]
    new_items=[]
    var get_lesson= "select * from lessons;"
    const [lessons, test] = await req.Connection.promise().query(get_lesson);
    for(let lesson of lessons){
      if(lesson.focus == 'other'){
        other.push(lesson);
      }
      if(lesson.focus == 'placement'){
        placement.push(lesson);
      }
      if(lesson.focus == 'moves'){
        moves.push(lesson);
      }
      if(lesson.focus == 'hooks'){
        hooks.push(lesson);
      }
      if(lesson.isnew == '1'){
        new_items.push(lesson);
      }
    }
    res.render('learn',{focus:req.body.id, username:req.session.username, other: other, placement: placement, hooks: hooks, moves: moves, new: new_items});
  }else if(req.session.userId===undefined){
    res.redirect('/login');
  }else{
    req.redirect('/payment')
  }
})
app.post('/train',async(req,res)=>{
  console.log(req.body)
  const Membershipexpired = await checkMembership(req);
  if(req.session.userId!==undefined && Membershipexpired){
    const type = req.body.id;
    const sql = "select overall from climb_info where user_id = ?";
    const values = [req.session.userId]
    const [rows, fields] = await req.Connection.promise().query(sql, values);
    const overall= rows[0].overall;
    workouts=[
      {
        name: "Easy",
      },
      {
        name: "Medium",
      },
      {
        name: "Hard",
      }
    ]
    stretches=[]
    endurance=[]
    strength=[]
    new_items=[]
    var get_exercises = "";
    console.log(req.body.Location)
    if(req.body.Location){
      if(req.body.Location=="gym"){
      if(overall > 2){
        get_exercises= "select * from exercises"
      }else{
        get_exercises= "select * from exercises where difficulty=1"
      }
      const [exercises, test] = await req.Connection.promise().query(get_exercises);
      for(let exercise of exercises){
        if(exercise.focus == 'stretch'){
          stretches.push(exercise);
        }
        if(exercise.focus == 'endurance'){
          endurance.push(exercise);
        }
        if(exercise.focus == 'strength'){
          strength.push(exercise);
        }
        if(exercise.isnew == '1'){
          new_items.push(exercise);
        }
      }
    }else{
      if(overall > 2){
        get_exercises= "select * from exercises where gym = 0"
      }else{
        get_exercises= "select * from exercises where difficulty=1 and gym=0"
      }
      const [exercises, test] = await req.Connection.promise().query(get_exercises);
      for(let exercise of exercises){
        if(exercise.focus == 'stretch'){
          stretches.push(exercise);
        }
        if(exercise.focus == 'endurance'){
          endurance.push(exercise);
        }
        if(exercise.focus == 'strength'){
          strength.push(exercise);
        }
        if(exercise.isnew == '1'){
          new_items.push(exercise);
        }
      }
    }
  }else{
    if(overall > 2){
      get_exercises= "select * from exercises"
    }else{
      get_exercises= "select * from exercises where difficulty=1"
    }
    const [exercises, test] = await req.Connection.promise().query(get_exercises);
    for(let exercise of exercises){
      if(exercise.focus == 'stretch'){
        stretches.push(exercise);
      }
      if(exercise.focus == 'endurance'){
        endurance.push(exercise);
      }
      if(exercise.focus == 'strength'){
        strength.push(exercise);
      }
      if(exercise.isnew == '1'){
        new_items.push(exercise);
      }
    }
  }
  req.session.workouts = workouts
  req.session.stretches = stretches
  req.session.endurance = endurance
  req.session.strength=strength
  req.session.exercise_focus = req.body.exercise_focus
  req.session.new = new_items;
  if(req.body.exercise_focus=="Strength"||req.body.exercise_focus=="strength"){
    res.render('train',{username: req.body.username,workouts: undefined,stretches: undefined,endurance: undefined,strength: strength,new_items: undefined,type: type});
  }else if(req.body.exercise_focus=="Flexibility"||req.body.exercise_focus=="flexibility"||req.body.exercise_focus=="Stretches"||req.body.exercise_focus=="stretches"){
    res.render('train',{username: req.body.username,workouts: undefined,stretches: stretches,endurance: undefined,strength: undefined,new_items: undefined,type: type});
  }
  else if(req.body.exercise_focus=="Endurance"||req.body.exercise_focus=="endurance"){
    res.render('train',{username: req.body.username,workouts: undefined,stretches: undefined,endurance: endurance,strength: undefined,new_items: undefined,type: type});
  }else{
    res.render('train',{username: req.body.username,workouts: workouts,stretches: stretches,endurance: endurance,strength: strength,new_items: new_items,type: type});
  }
  
  }else if(req.session.userId===undefined){
    res.redirect('/login');
  }else{
    req.redirect('/payment')
  }
})
app.get('/train',async(req,res)=>{
  const Membership = await checkMembership(req);
  if(req.session.userId!==undefined && Membership){
    res.render('train',{username: req.body.username,workouts: req.session.workouts,stretches: req.session.stretches,endurance: req.session.endurance,strength: req.session.strength,new_items: req.session.new, type: 'overall'});
  }
  else if(req.session.userId===undefined){
    res.redirect('/login');
  }else{
    res.redirect('/home')
  }
})
//render payment page
app.get('/payment',async(req,res)=>{
  const Membership = false
  if(req.session.userId!==undefined && !Membership){
    res.render('payment', {clientID: process.env.PAYPAL_CLIENT_ID});
  }
  else if(req.session.userId===undefined){
    res.redirect('/login');
  }else{
    res.redirect('/home')
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
  const [rows, fields] = await req.Connection.promise().query(sql, values);
  res.redirect('/home');
})
function get_random (list) {
  return list[Math.floor((Math.random()*list.length))];
}
function clean(id){
  new_string = ""
  if(id!=undefined){
  for(var i = 0; i <id.length;i++){
    if(id[i] != " "){
      new_string +=id[i]
    }else{
      new_string +="_"
    }
  }}
  return new_string
}
app.post('/calculate_workout', (req,res)=>{
  console.log(req.body);
  id=req.body.id;
  req.session.exercise_num=undefined
  if(id!=""){
    id=clean(id);
    if(id!="Hard" && id != "Medium" && id != "Easy"){
      let exercise_list = [id];
      req.session.exercise_list = exercise_list
    }else{
      let exercise_list=["dynamic_stretches"]
      let difficulty = 0;
      if(id =="Hard"){
        difficulty=6
      }else if(id == "Medium"){
        difficulty = 4
      }else{
        difficulty = 2
      }
      let all_list = req.session.strength.concat(req.session.endurance)
      while(difficulty>0){
        let item = get_random(all_list)
        difficulty = difficulty - item.difficulty;
        exercise_list = exercise_list.concat(item.name)
      }
      req.session.exercise_list=exercise_list.concat('static_stretches')
    }
    res.redirect('/exercises')
  }else{
    res.render('/train', { errorMessage: req.session.errorMessage })
  }
  //all i need to do is make it calculate easy medium and hard
})
//display handler and continue for the page
app.get('/exercises', async(req,res)=>{
  console.log(req.session.current_exercise)
  const Membership = await checkMembership(req);
  if(req.session.userId!==undefined && Membership){
    // render/continue
    if(req.session.exercise_num>req.session.exercise_list.length){
      res.redirect('workouts')
    }else if(req.session.exercise_num === undefined){
      req.session.exercise_num = 1
      console.log(req.session.exercise_list[0])
      let a =clean(req.session.exercise_list[0])
      if(a!==""){
      res.render("exercises/"+a)
      }else{
        res.render('train',{username: req.body.username,workouts: req.session.workouts,stretches: req.session.stretches,endurance: req.session.endurance,strength: req.session.strength,new_items: req.session.new, type: 'overall'});
      }
    }
else{
      req.session.exercise_num += 1
      let a =clean(req.session.exercise_list[req.session.exercise_num-1])
      if(a!==""){
      res.render("exercises/"+a)
      }else{
        res.render('train',{username: req.body.username,workouts: req.session.workouts,stretches: req.session.stretches,endurance: req.session.endurance,strength: req.session.strength,new_items: req.session.new, type: 'overall'});
      }
    }
  }
  else if(req.session.userId===undefined){
    res.redirect('/login');
  }else{
    res.redirect('/home')
  }
})
app.post('/get_lesson',async(req,res)=>{
  console.log(req.session.current_exercise)
  const Membership = await checkMembership(req);
  if(req.session.userId!==undefined && Membership){
    res.render('lessons/'+clean(req.body.id))
  }else if(req.session.userId===undefined){
      res.redirect('/login');
    }else{
      res.redirect('/home')
    }
})





  //custom 404 error for page not found
  app.use(function(req, res, next) {
    res.status(404);
    res.locals.is_user = req.session.userId; // pass username as a local variable
    res.render('404');
  });
app.listen(3000, () => {
    console.log('Server is running on port 3000');
});