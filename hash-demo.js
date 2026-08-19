import bcrypt from 'bcrypt';

const password = 'secret123'; //fake plain password
const saltRounds = 10; //cost factor for hashing

const hash = await bcrypt.hash(password, saltRounds); //create the hash
console.log('hash', hash);

const match = await bcrypt.compare('secret123', hash);
console.log('correctpassword?', match);

const wrong = await bcrypt.compare('wrong-password', hash);
console.log('wrong password?', wrong);