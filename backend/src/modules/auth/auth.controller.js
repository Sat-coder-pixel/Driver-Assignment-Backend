const jwt= require("jsonwebtoken");
const bcrypt= require("bcryptjs");

const { PrismaClient } = require('../../generated/prisma');
const prisma = new PrismaClient();

exports.signup= async(req,res)=>{
    const {username,email,password,role}= req.body;
    try{
        const hashedPassword= await bcrypt.hash(password,10);
        // console.log(username); 
        // console.log(email);
        // console.log(role);
        // console.log(hashedPassword);
        const user= await prisma.User_Db.create({
            data: {username,email,password: hashedPassword,role}
        });
        return res.status(201).json({message: "user created successfully", user});
    }catch(error){
        console.error(error);
        return res.status(500).json({message: "internal server error"});
    }
};

exports.login= async(req,res)=>{
    const {username,password}= req.body;
    try{
        const user=await prisma.User_Db.findUnique({where: {username}});
        if(!user){
            return res.status(404).json({message: "user not found"});
        }
        const isMatch= await bcrypt.compare(password,user.password);
        if(!isMatch){
            return res.status(401).json({message: "invalid credentials"});
        }

        //Generate JWT
        const token= jwt.sign({id: user.id, username: user.username,role: user.role},
            process.env.JWT_SECRET,
            {expiresIn: "10h"}
        )
        return res.status(200).json({token});
    }catch(error){
        console.error(error);
        return res.status(500).json({message: "internal server error"});
    }
};