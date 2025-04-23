const express = require("express")
const router = express.Router();
const Content = require("../models/Content")


const { GoogleGenAI } = require("@google/genai");


let hello = [];

const genai = new GoogleGenAI( {apiKey:"AIzaSyDwduC5DYRNBlGCwbTofvPfXUHSl3gORZY"} )

router.get("/gen", async(req,res) => {

    const prompt = req.query.prompt;

    if(!prompt){
        res.status(400).json({message:"Please Enter Prompt !!! "})
    }

    if(res.status(400)){
        console.log("Error Coming of 400")
    }

    try{

        
        

        const response = await genai.models.generateContent({
            model: "gemini-2.0-flash",
            contents: `You are a professional social media post creator. Based on the topic: "${prompt}", create up to 6 short, engaging posts for Instagram, Twitter, and Facebook.

                        ✨ Important:
                        - Return ONLY a valid JSON array.
                        - Format like: ["Post 1...", "Post 2...", "Post 3...", "Post 4...", "Post 5...", "Post6..."]
                        - Do not include explanations, markdown, or formatting.
                        - Include 2 hashtags, emojis, and make each post clear, define full story and valuable.

                        Begin now:
                    `,
          });

          
          const datacollect = await  response.text;
          const cleaningodData = datacollect.replace(/```json\n|\n```/g, '');
          const posts = JSON.parse(cleaningodData)
          
          
          hello = (posts)
          
          res.status(200).json(posts);

          if(hello){
            console.log("hello Dear", hello);
          }
          
    }
    catch(error){
        console.log(error)
    }

   


})




router.get("/get", async(req, res) => {
    
    try{
    const detail = await Content.find();

    if(!detail){
        res.status(400).json("Content not found");
    }
    

    
    

    res.send(detail);

    }
    catch(error){
        res.send(error);

    }
    
})

router.post("/create", async(req, res) => {
    const content = req.body;

    if(hello){
        console.log("hello dear", hello);
    }

    try{

        
        if(hello.length>0){

            const existcontent = await Content.find({content: {$in : hello}}).distinct("content");

            const newContent = hello.filter((item) => !existcontent.includes(item));
            

            const helloElement = newContent.map((item) => ({content: item, unique: true}));

            if(helloElement.length){

                const detailupload = await Content.insertMany(helloElement);

                console.log(detailupload);
                res.send(detailupload)

            }
            else{
                res.send("Post Already available please, Try another to post")
            }

        }

        else{
            res.send("please Try Again....")
        }
        
    }
    catch(error){
        console.log(error);
    }
})


router.get("/post/:id", async(req, res) =>{
    
   try{
    const{ id } = req.params;
    const celect = await Content.findById(id);
    if(!celect){
        return res.status(400).json("Post not found");

    }
    res.status(200).json(celect)

   }
   catch(error){
    console.log(error)
   }

})

module.exports = router;
