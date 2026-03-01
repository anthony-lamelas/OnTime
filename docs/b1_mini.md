Authentication: 
●​ /registration 
●​ /login 
●​ /logout 
 
Users: 
●​ Id 
●​ Email 
●​ Password (hash) 
●​ Created_at 
 
 
Prediction: 
●​ Logic flow 
○​ Validate input (where user is going) 
○​ Fetch live train status  
○​ Call ML inference API 
○​ Compute recommendation score 
○​ Return structured response 
 
●​ Recommendation score 
○​ Figure out later once we know what ML model is giving us 
 
●​ Live Data API 
○​ Chris Brasil 
 
●​ ML Inference 
○​ Separate microservice for the model 
○​ EC2 
 
 
Deployment: 
●​ EC2 - backend 
●​ S3 - store frontend build 
●​ RDS - for postgres 
●​ API Gateway 
●​ Docker 
●​ Cloudwatch - monitoring 
 
Frontend: 
●​ Login page 
●​ Register page 
●​ dashboard/home page 
●​ Route selection form (where user puts stations) 
○​ Not sure what this will be like yet as there is a route api we r gonna be using 
 
 
Possible Extra stuff: 
●​ Saving routes (favorites) 
