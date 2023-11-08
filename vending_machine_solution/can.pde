//this is a class for making cans of pop objects
class Can {
  float xPosition; //the position of our can in x
  float yPosition; //and y
  float xSpeed; //the speed of our can in x
  float ySpeed; //and y
  color canColor; //the color of our can
  float w = 95; //the width of the can
  float h = 55; //the height of the can

  //the contructor
  Can(float x, float y, color col) {
    xPosition = x;
    yPosition = y;
    //initialise speed to something random but up and to the left of
    //the vending machine, so it makes a nice arc as if flies
    xSpeed = random(-10, -1);
    ySpeed = random(-10, -1);
    canColor = col;
  }

  //move the can, apply gravity
  void update() {
    xPosition = xPosition + xSpeed;
    ySpeed = ySpeed + 0.5; //apply gravity to the y speed
    yPosition = yPosition + ySpeed;
  }

  //draw the can
  void show() {
    fill(canColor); //set the color to our can's color
    rect(xPosition, yPosition, w, h); //draw at the can's position, can's width and height
  }

  //checks if the can position is on the screen.
  //returns true if it is, false if its not.
  //(does not account for the width or height of the can)
  boolean isOnScreen() {
    return (xPosition > 0 && xPosition < width && yPosition > 0 && yPosition < height);
  }
}
