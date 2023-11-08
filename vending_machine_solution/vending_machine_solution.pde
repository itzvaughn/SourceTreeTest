//These are some constants we're using. The convention is to
//name them in capital letters so you know they're constant
//and their values won't change (be assigned new values)
color GREEN = color(40, 160, 90);
color DARK_GREEN = color(0, 120, 50);
color BLUE = color(42, 155, 245);
color DARK_BLUE = color(2, 115, 205);
color YELLOW = color(255, 243, 5);
color DARK_YELLOW = color(215, 203, 0);
color RED = color(255, 5, 68);
color DARK_RED = color(215, 0, 28);
color INSIDE = color(255, 188, 0); //orange
color SHELF = color(164, 132, 167); //purple-grey
color OUTSIDE = color(200); //grey
float CAN_SPAWN_X = 250; //x value of spawn point for cans
float CAN_SPAWN_Y = 750; //and y value

//declare some buttons
Button greenButton;
Button blueButton;
Button yellowButton;
Button redButton;
Button refillButton;

//declare some cans
Can greenCan1 = null;
Can greenCan2 = null;
Can greenCan3 = null;
Can blueCan1 = null;
Can blueCan2 = null;
Can blueCan3 = null;
Can yellowCan1 = null;
Can yellowCan2 = null;
Can yellowCan3 = null;
Can redCan1 = null;
Can redCan2 = null;
Can redCan3 = null;

//declare some timer variables
float timerMinValue = 50; //min and max length timer will run for
float timerMaxValue = 100;
float timerValue = 0; //increments when timer is running
float timerTarget = random(timerMinValue, timerMaxValue); //timer stops when it reaches this value
boolean timeIsUp = false; //timer is finished

//declare a position offset for the entire vending machine for shaking it
float xPosition = 375;
float yPosition = 55;
float xOffset = 0;
float yOffset = 0;

void setup() {
  //set the canvas and stroke weight
  size(1000, 1000);
  strokeWeight(5);

  //instantiate some button objects so we can use them
  greenButton = new Button(xPosition + 475, yPosition + 250, 100, 50, GREEN);
  blueButton = new Button(xPosition + xOffset + 475, yPosition + yOffset + 325, 100, 50, BLUE);
  yellowButton = new Button(xPosition + xOffset + 475, yPosition + yOffset + 400, 100, 50, YELLOW);
  redButton = new Button(xPosition + xOffset + 475, yPosition + yOffset + 475, 100, 50,  RED);
  refillButton = new Button(xPosition + xOffset + 475, yPosition + yOffset + 600, 100, 50, SHELF);

  //we're not going to instantiate the can objects till they're vended
}


void draw() {
  //draw the background
  background(200, 225, 230); //the sky
  fill(90, 100, 100); //grey-green
  rect(0, 700, 1000, 300);
  
  //draw the back of the vending machine
  fill(OUTSIDE); //grey
  rect(xPosition + xOffset + 0, yPosition + yOffset + 0, 600, 900); //the cabinet
  fill(SHELF);
  rect(xPosition + xOffset + 100, yPosition + yOffset + 700, 350, 75); //the can chute
  rect(xPosition + xOffset + 100, yPosition + yOffset + 775, 350, 50);
  fill(INSIDE); //orange
  rect(xPosition + xOffset + 100, yPosition + yOffset + 100, 350, 450); //the back of the cabinet
  fill(SHELF);
  rect(xPosition + xOffset + 100, yPosition + yOffset + 300, 350, 25); //shelves
  rect(xPosition + xOffset + 100, yPosition + yOffset + 525, 350, 25);

  //draw stock in the vending machine
  //we're not using else ifs because we want all true statements
  //to execute, not just the first true statement

  //draw the green cans
  if (greenCan1 == null && greenCan2 == null && greenCan3 == null) {
    //draw the third can on the shelf
    fill(DARK_GREEN); //make this darker
    rect(xPosition + xOffset + 175, yPosition + yOffset + 125, 75, 100);
  }
  if (greenCan2 == null && greenCan3 == null) {
    //draw the second can on the shelf
    fill(DARK_GREEN); //make this darker
    rect(xPosition + xOffset + 150, yPosition + yOffset + 150, 75, 100);
  }
  if (greenCan3 == null) {
    //draw the first can on the shelf
    fill(GREEN);
    rect(xPosition + xOffset + 125, yPosition + yOffset + 175, 75, 100);
  }

  //draw the blue cans
  if (blueCan1 == null && blueCan2 == null && blueCan3 == null) {
    //draw the third can on the shelf
    fill(DARK_BLUE); //make this darker
    rect(xPosition + xOffset + 325, yPosition + yOffset + 125, 75, 100);
  }
  if (blueCan2 == null && blueCan3 == null) {
    //draw the second can on the shelf
    fill(DARK_BLUE); //make this darker
    rect(xPosition + xOffset + 300, yPosition + yOffset + 150, 75, 100);
  }
  if (blueCan3 == null) {
    //draw the first can on the shelf
    fill(BLUE);
    rect(xPosition + xOffset + 275, yPosition + yOffset + 175, 75, 100);
  }

  //draw the yellow cans
  if (yellowCan1 == null && yellowCan2 == null && yellowCan3 == null) {
    //draw the third can on the shelf
    fill(DARK_YELLOW); //make this darker
    rect(xPosition + xOffset + 175, yPosition + yOffset + 350, 75, 100);
  }
  if (yellowCan2 == null && yellowCan3 == null) {
    //draw the second can on the shelf
    fill(DARK_YELLOW); //make this darker
    rect(xPosition + xOffset + 150, yPosition + yOffset + 375, 75, 100);
  }
  if (yellowCan3 == null) {
    //draw the first can on the shelf
    fill(YELLOW);
    rect(xPosition + xOffset + 125, yPosition + yOffset + 400, 75, 100);
  }

  //draw the red cans
  if (redCan1 == null && redCan2 == null && redCan3 == null) {
    //draw the third can on the shelf
    fill(DARK_RED); //make this darker
    rect(xPosition + xOffset + 325, yPosition + yOffset + 350, 75, 100);
  }
  if (redCan2 == null && redCan3 == null) {
    //draw the second can on the shelf
    fill(DARK_RED); //make this darker
    rect(xPosition + xOffset + 300, yPosition + yOffset + 375, 75, 100);
  }
  if (redCan3 == null) {
    //draw the first can on the shelf
    fill(RED);
    rect(xPosition + xOffset + 275, yPosition + yOffset + 400, 75, 100);
  }

  //draw the front of the vending machine
  //a glass reflections effect.
  fill(190, 250, 255, 100); //transparent light blue
  rect(xPosition + xOffset + 100, yPosition + yOffset + 100, 350, 450);

  //draw the buttons, based on whether there is stock left
  //if any can is null (not yet spawned) this will evaluate to true for stock left
  greenButton.show(greenCan1 == null || greenCan2 == null || greenCan3 == null, xOffset, yOffset);
  blueButton.show(blueCan1 == null || blueCan2 == null || blueCan3 == null, xOffset, yOffset);
  yellowButton.show(yellowCan1 == null || yellowCan2 == null || yellowCan3 == null, xOffset, yOffset);
  redButton.show(redCan1 == null || redCan2 == null || redCan3 == null, xOffset, yOffset);
  //if any of the 1st cans are null (not yet spawned) this will evaluate to false
  //because we don't need to allow refilling stock till some has been vended
  refillButton.show(greenCan1 != null || blueCan1 != null || yellowCan1 != null || redCan1 != null, xOffset, yOffset);

  //update and show cans
  if (greenCan1 != null) {
    greenCan1.update();
    greenCan1.show();
  }
  if (greenCan2 != null) {
    greenCan2.update();
    greenCan2.show();
  }
  if (greenCan3 != null) {
    greenCan3.update();
    greenCan3.show();
  }

  if (blueCan1 != null) {
    blueCan1.update();
    blueCan1.show();
  }
  if (blueCan2 != null) {
    blueCan2.update();
    blueCan2.show();
  }
  if (blueCan3 != null) {
    blueCan3.update();
    blueCan3.show();
  }

  if (yellowCan1 != null) {
    yellowCan1.update();
    yellowCan1.show();
  }
  if (yellowCan2 != null) {
    yellowCan2.update();
    yellowCan2.show();
  }
  if (yellowCan3 != null) {
    yellowCan3.update();
    yellowCan3.show();
  }

  if (redCan1 != null) {
    redCan1.update();
    redCan1.show();
  }
  if (redCan2 != null) {
    redCan2.update();
    redCan2.show();
  }
  if (redCan3 != null) {
    redCan3.update();
    redCan3.show();
  }
  
  //if the timer is up, spawn some cans as if the vending machine has been shaken
  if(timeIsUp) {
    if (greenCan1 == null) {
      greenCan1 = new Can(xPosition + xOffset + CAN_SPAWN_X, yPosition + yOffset + CAN_SPAWN_Y, GREEN);
    } else if (greenCan2 == null) {
      greenCan2 = new Can(xPosition + xOffset + CAN_SPAWN_X, yPosition + yOffset + CAN_SPAWN_Y, GREEN);
    } else if (greenCan3 == null) {
      greenCan3 = new Can(xPosition + xOffset + CAN_SPAWN_X, yPosition + yOffset + CAN_SPAWN_Y, GREEN);
    }
    if (blueCan1 == null) {
      blueCan1 = new Can(xPosition + xOffset + CAN_SPAWN_X, yPosition + yOffset + CAN_SPAWN_Y, BLUE);
    } else if (blueCan2 == null) {
      blueCan2 = new Can(xPosition + xOffset + CAN_SPAWN_X, yPosition + yOffset + CAN_SPAWN_Y, BLUE);
    } else if (blueCan3 == null) {
      blueCan3 = new Can(xPosition + xOffset + CAN_SPAWN_X, yPosition + yOffset + CAN_SPAWN_Y, BLUE);
    }
    if (yellowCan1 == null) {
      yellowCan1 = new Can(xPosition + xOffset + CAN_SPAWN_X, yPosition + yOffset + CAN_SPAWN_Y, YELLOW);
    } else if (yellowCan2 == null) {
      yellowCan2 = new Can(xPosition + xOffset + CAN_SPAWN_X, yPosition + yOffset + CAN_SPAWN_Y, YELLOW);
    } else if (yellowCan3 == null) {
      yellowCan3 = new Can(xPosition + xOffset + CAN_SPAWN_X, yPosition + yOffset + CAN_SPAWN_Y, YELLOW);
    }
    if (redCan1 == null) {
      redCan1 = new Can(xPosition + xOffset + CAN_SPAWN_X, yPosition + yOffset + CAN_SPAWN_Y, RED);
    } else if (redCan2 == null) {
      redCan2 = new Can(xPosition + xOffset + CAN_SPAWN_X, yPosition + yOffset + CAN_SPAWN_Y, RED);
    } else if (redCan3 == null) {
      redCan3 = new Can(xPosition + xOffset + CAN_SPAWN_X, yPosition + yOffset + CAN_SPAWN_Y, RED);
    }
  }
  
}


//see if the mouse is over any buttons when pressed. If so, instantiate
//a new can object with the same color as the button's color
void mousePressed() {
  if (greenButton.mouseIsOver()) {
    if (greenCan1 == null) {
      greenCan1 = new Can(xPosition + xOffset + CAN_SPAWN_X, yPosition + yOffset + CAN_SPAWN_Y, GREEN);
    } else if (greenCan2 == null) {
      greenCan2 = new Can(xPosition + xOffset + CAN_SPAWN_X, yPosition + yOffset + CAN_SPAWN_Y, GREEN);
    } else if (greenCan3 == null) {
      greenCan3 = new Can(xPosition + xOffset + CAN_SPAWN_X, yPosition + yOffset + CAN_SPAWN_Y, GREEN);
    }
  }

  if (blueButton.mouseIsOver()) {
    if (blueCan1 == null) {
      blueCan1 = new Can(xPosition + xOffset + CAN_SPAWN_X, yPosition + yOffset + CAN_SPAWN_Y, BLUE);
    } else if (blueCan2 == null) {
      blueCan2 = new Can(xPosition + xOffset + CAN_SPAWN_X, yPosition + yOffset + CAN_SPAWN_Y, BLUE);
    } else if (blueCan3 == null) {
      blueCan3 = new Can(xPosition + xOffset + CAN_SPAWN_X, yPosition + yOffset + CAN_SPAWN_Y, BLUE);
    }
  }

  if (yellowButton.mouseIsOver()) {
    if (yellowCan1 == null) {
      yellowCan1 = new Can(xPosition + xOffset + CAN_SPAWN_X, yPosition + yOffset + CAN_SPAWN_Y, YELLOW);
    } else if (yellowCan2 == null) {
      yellowCan2 = new Can(xPosition + xOffset + CAN_SPAWN_X, yPosition + yOffset + CAN_SPAWN_Y, YELLOW);
    } else if (yellowCan3 == null) {
      yellowCan3 = new Can(xPosition + xOffset + CAN_SPAWN_X, yPosition + yOffset + CAN_SPAWN_Y, YELLOW);
    }
  }

  if (redButton.mouseIsOver()) {
    if (redCan1 == null) {
      redCan1 = new Can(xPosition + xOffset + CAN_SPAWN_X, yPosition + yOffset + CAN_SPAWN_Y, RED);
    } else if (redCan2 == null) {
      redCan2 = new Can(xPosition + xOffset + CAN_SPAWN_X, yPosition + yOffset + CAN_SPAWN_Y, RED);
    } else if (redCan3 == null) {
      redCan3 = new Can(xPosition + xOffset + CAN_SPAWN_X, yPosition + yOffset + CAN_SPAWN_Y, RED);
    }
  }

  //for the refil button, we'll reset the stock levels instead
  if (refillButton.mouseIsOver()) {
    //reset the stock
    greenCan1 = null;
    greenCan2 = null;
    greenCan3 = null;
    blueCan1 = null;
    blueCan2 = null;
    blueCan3 = null;
    yellowCan1 = null;
    yellowCan2 = null;
    yellowCan3 = null;
    redCan1 = null;
    redCan2 = null;
    redCan3 = null;
  }
}

void keyPressed(){
  //shake the vending machine
  xOffset = random(-2, 2);
  yOffset = random(-2, 2);
  timerValue = timerValue +1;
  if(timerValue >= timerTarget) {
    timeIsUp = true;
  }
  //println("Timer value: " + timerValue + " target: " + timerTarget + " " + timeIsUp);
}

void keyReleased(){
  //reset the timer when the key is released
  timeIsUp = false;
  timerValue = 0;
  timerTarget = random(timerMinValue, timerMaxValue);
}
