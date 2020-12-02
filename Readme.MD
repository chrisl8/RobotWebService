ArloBot Cloud Server
====================

This is a work in progress. More of a personal stash of my working code that something anybody might use themselves.  
Nevertheless, if you are using ArloBot, and need a way to communicate with it or find it on a network, message me, and I will see if I can help you get this running.  

The purpose of the code here is to run in the "cloud" on a server, such as on a Digital Ocean droplet.  
This is to facilitate the communication between the robot on a network what is either private, or simply unstable.

Current Features:
1. Accept incoming Twilio messages and relay them to robot when it comes online.  
2. Provide a consistent web interface URL that will redirect to the robot's current IP address. 
   
Future Goals:  
1. Provide a front end for "chatting" with the robot without running the direct web interface to the robot, i.e. from a remote location.  
2. Provide a framework for authenticating to an external service before controlling robot.

