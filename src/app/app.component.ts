import { Component, ViewChild, ElementRef} from '@angular/core';
import * as AWS from "aws-sdk";
import { PromiseResult } from "aws-sdk/lib/request";

// Input the identity pool id you received from AWS Cognito below
const cognitoPoolId = "{insert-cognito-identity-pool-id}";
// Input the API key for making Cathay Pacific API calls
const apiKey = "{insert-cathay-pacific-api-key}";

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})

export class AppComponent {
  title = 'checkInApp';

    @ViewChild("video", {static:false})
    public video: ElementRef;

    @ViewChild("canvas", {static:false})
    public canvas: ElementRef;

    @ViewChild("systemDisplay", {static:false})
    public systemDisplay:ElementRef;

    @ViewChild("msg", {static:false})
    public msg:ElementRef;

    @ViewChild("bookingReference", {static:false})
    public bookingReference:ElementRef;

    @ViewChild("userName", {static:false})
    public userName:ElementRef;

    @ViewChild("status", {static:false})
    public status:ElementRef;

    public captures: Array<any>;
    public stream: any;
    public identifiedUserName: Array<any>;

    public ngOnInit() { 
        AWS.config.region = 'us-east-1'; // Region
        AWS.config.credentials = new AWS.CognitoIdentityCredentials({
            IdentityPoolId: cognitoPoolId
        });
    }

    public ngAfterViewInit() {
    }

    // Switch camera and video stream on/off 
    public change_cam_mode(){
      if( this.video.nativeElement.hidden){
        if(navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
            navigator.mediaDevices.getUserMedia({ video: true }).then(stream => {
            this.video.nativeElement.srcObject = stream;
            this.video.nativeElement.play();
          });
        }
        this.video.nativeElement.hidden = false;
      }else{
        this.video.nativeElement.hidden = true;
        navigator.mediaDevices.getUserMedia({ video: true }).then(stream => {
          var tracks = stream.getTracks();

          tracks.forEach(function(track) {
            track.stop();
          });

          this.video.nativeElement.srcObject = null;
          this.video.nativeElement.pause();
        });
      }
    }

    // 1. Capture user face image
    // 2. identify the user
    // 3. Then retrieve the booking details per user-inserted Booking Reference
    public async capture_face() {

      this.canvas.nativeElement.getContext("2d").drawImage(this.video.nativeElement, 0, 0, 640, 480);

      this.captures = [];
      this.captures.push(this.canvas.nativeElement.toDataURL("data:image/png;base64"));
      //console.log(this.captures);

      var dataURI = this.canvas.nativeElement.toDataURL("data:image/png;base64");
      //console.log(dataURI);

      this.systemDisplay.nativeElement.hidden = false;
      this.msg.nativeElement.innerHTML = "Processing Image...";

        this.SearchFace(this.dataURItoBlob(dataURI)).then(
            (data) => {

                this.identifiedUserName = [];
                
                this.identifiedUserName.push(this.formatName(data.FaceMatches[0].Face.ExternalImageId).split(' ')[0]);
                this.identifiedUserName.push(this.formatName(data.FaceMatches[0].Face.ExternalImageId).split(' ')[1])
                
                this.userName.nativeElement.innerHTML = this.identifiedUserName[0] + " " + this.identifiedUserName[1];
                this.msg.nativeElement.innerHTML = 'had been identified';                

                console.log('Given Name: ' + this.identifiedUserName[0] + ' || Surename: ' + this.identifiedUserName[1]);

                this.retrieveBooking(this.bookingReference.nativeElement.value, this.identifiedUserName[1], this.identifiedUserName[0]);

            }).catch((err) => {
            console.error(err);
        });

    }

    //Convert dataURL to imageBytes
    public dataURItoBlob(dataURI) {
        const image = atob(dataURI.split("data:image/png;base64,")[1]);
        var length = image.length;
        var imageBytes = new ArrayBuffer(length);
        var ua = new Uint8Array(imageBytes);
        for (var i = 0; i < length; i++) {
          ua[i] = image.charCodeAt(i);
        }
  
        return imageBytes;

     }
    
    //Call Rekognition API for Face identification
    public SearchFace(imageBytes):
        Promise<PromiseResult<AWS.Rekognition.SearchFacesByImageResponse, AWS.AWSError>> {

            var params = {
                CollectionId: 'cx-demo-rekognition',
                Image: {
                    Bytes: imageBytes
                }
            };

            const rekognition = new AWS.Rekognition();

            return rekognition.searchFacesByImage(params).promise();

        }
    
    //Format the name returned from Rekognition
    public formatName(string) {
        return string.split('_')[0].charAt(0).toUpperCase() + string.split('_')[0].slice(1) + " " + string.split('_')[1].charAt(0).toUpperCase() + string.split('_')[1].slice(1);
    }

    //Retreive the booking details through GET from Cathay Pacific API
    public async retrieveBooking(rloc, familyName, givenName){
        console.log(rloc, familyName, givenName);

        var url = "https://t0.api.osc1.ct1.cathaypacific.com/hackathon-apigw/api/v1/olci/getBooking?" + "rloc=" + rloc + "&familyName=" + familyName + "&givenName=" + givenName;
        console.log(url);

        const response = await fetch(url, {
            method: 'GET',
            headers: {
                'apikey': apiKey
            }
        });

        var result = await response.json();
        console.log(result);

        var flightDetails = result.journeys[0].passengers[0].flights[0];
        var status = flightDetails.operateCompany + flightDetails.operateFlightNumber + " is your upcoming flight. " + "This flight will be departure from " + flightDetails.originPort + " to " + flightDetails.destPort + " at " + flightDetails.departureTime + ". ";
        this.status.nativeElement.innerHTML = status;

    }

    //Check-in for passenger through POST to Cathay Pacific API
    public async check_in(){
      
      this.status.nativeElement.innerHTML = "Please wait for a moment while we are processing your check-in request.";
      var element = this.userName.nativeElement;

      if(element.innerHTML === ""){
        this.status.nativeElement.innerHTML = "no user identity had been verified yet.";
      }else{
        var checkInDetails = {
          "givenName": this.identifiedUserName[0],
          "familyName": this.identifiedUserName[1],
          "rloc": this.bookingReference.nativeElement.value,
          "journeyId": 0
        };

        var body = JSON.stringify(checkInDetails);
        console.log(body);

        var url = "https://t0.api.osc1.ct1.cathaypacific.com/hackathon-apigw/api/v1/olci/checkin";
        console.log(url);
    
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'apikey': apiKey,
            'Content-Type': 'application/json'
          },
          body: body
        });
    
        var result = await response.json();
        console.log(result);
        
        //TODO: Add conditional statement before returning success message
        this.status.nativeElement.innerHTML = "You have been checked in.";
      }  
    }
}