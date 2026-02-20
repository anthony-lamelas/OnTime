 
 
 
Course: CS 4523 
Semester: Spring 2026 
Advisor: Professor Strauss 
 
Team Number: B1 
Project Name: OnTime 
Team members:  
Anthony Lamelas, al8372  
Uriel Olayinka, umo204 
Christopher Mendoza Brasil, cdm9703 
Edward Kang, emk9058 
​
​
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
 
Product Overview 
​
The goal of this project is to provide users with an efficient way of 
planning their subway trips, accounting for all possible issues, including 
delays, crime, and more. The project will also allow for further analysis 
into why delays occur and when they occur, using years of data. 
Through the use of machine learning in combination with live data, 
users will be provided with a recommendation on what their best option 
for travel is. 
 
Requirements 
 
Motivation: 
​
New York City’s subway system is essential to the daily lives of 
millions of residents throughout the city, especially students and workers 
who rely on public transit for affordable and sustainable mobility. Even 
with its importance, subway delays remain frequent, unpredictable, and 
unevenly distributed across lines, times, and neighborhoods. These 
disruptions can significantly affect commuters by causing missed 
classes, late arrivals to work, and increased stress, while also reducing 
confidence in public transportation as a reliable option. A lack of 
predictive tools means riders are often forced to react to delays rather 
than plan around them. This problem shows the need for a data-driven 
approach to improve reliability in urban transit systems. 
 
Description: 
 
Data Collection and Preprocessing 
​
The first requirement of this project is to collect and 
preprocess data. The main source of the data will come from the 
MTA open data program, providing information on subway delays 
and the circumstances in which they occur. After searching the 
internet and gathering as much related data as possible, the next 
step would be to clean the data into a format that is ideal for model 
training. This would occur by performing feature engineering 
actions such as transformations, aggregations, dropping certain 
columns, and more.  
 
Model Development 
The second requirement is to develop a model using the 
preprocessed data. During this process, multiple models will be 
trained and evaluated on subsets of the dataset. Based on the 
validation results, we will make design decisions such as which 
model to use, what hyperparameters to tune, and more. We may 
also perform certain feature transformations to analyze how well 
our models are generalizing and to ensure they are not overfitting. 
 
​
Live Data Ingestion 
The system will support live data ingestion to incorporate 
real-time model predictions posted on the web app. After the live 
data is implemented into the app, the inputs for the model will be 
based on the user's selected train lines, stations, and times. Because 
constantly scraping live data may result in performance 
degradation, only the data requested by the user will be used in real 
time. A recommendation system will also be integrated based on 
the live data, for example, if a certain train is not running at the 
time of use, a route for that train will not be recommended. 
 
​
User Interface and Profile 
A web-based user interface will be developed to allow users 
to interact with the delay prediction system. They will be able to 
choose train lines, stations, and times, and view predicted delays in 
a clear visual format. Users will also be able to save preferences 
and frequently used routes so that the data for that route is 
prioritized during scraping to improve performance.  
 
Model Inference Pipeline 
Once the model is trained and the app is set up, the model 
will need to be deployed. This will allow the application to 
generate predictions based on user requests through a RESTful 
API endpoint. This API will combine the model output and the 
real-time data to generate a score. This score is what will be used 
to give the user the information they need. 
 
​
Cloud Deployment​  
After the app is tested and ready to be used by the public, it 
will be deployed using AWS. The prediction API will be hosted on 
EC2, and Docker containers will be used to containerize the 
application and ensure consistency. The trained model will be 
stored on S3, and we will use the API Gateway to handle user 
prediction requests securely. Lastly, monitoring will occur using 
CloudWatch. 
 
Related Goals: 
 
Goal 9: Build resilient infrastructure, promote inclusive and 
sustainable industrialization, and foster innovation 
This project will make transit more reliable without needing 
immediate, multi-billion-dollar overhauls by adding a digital 
upgrade to aging physical infrastructure. 
 
Goal 10: Make cities and human settlements inclusive, safe, 
resilient, and sustainable 
OnTime supports this goal by showing the uneven subway 
delay patterns across different lines and neighborhoods, which can 
disproportionately affect transit-dependent communities. 
 
Goal 11: Take urgent action to combat climate change and its 
impacts 
Improving the perception of the punctuality of the subway 
will encourage more people to choose the subway for transport 
over the less-sustainable car. 
 
 
Project Deliverables 
 
 
●​ Project Proposal (Due 2/3/26) 
●​ Project Information Description (Due 2/26/26) 
●​ Software System Design Specification (SSDS) - 3 deliverables 
○​ Domain (Due 2/19/26) 
○​ Requirements/Analysis (Due 3/5/26) 
○​ Design (Due 5/5/26) 
●​ Implementation (Code with documentation, initial due 3/3/26, 
final due 5/5/26) 
●​ Presentation and Demonstration (Due 5/6/25) 
 
 
 
