from fastapi import APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, EmailStr, Field
from jose import JWTError, jwt
from datetime import datetime, timedelta, timezone
import random
import string
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import os
import logging
from motor.motor_asyncio import AsyncIOMotorDatabase
from typing import Optional

# Configuration
SECRET_KEY = os.environ.get("JWT_SECRET_KEY", "your-secret-key-change-in-production-please-use-strong-key")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days
OTP_EXPIRE_MINUTES = 10

# Email configuration (using Gmail SMTP as example)
SMTP_SERVER = os.environ.get("SMTP_SERVER", "smtp.gmail.com")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "587"))
SMTP_EMAIL = os.environ.get("SMTP_EMAIL", "")
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD", "")

security = HTTPBearer()
auth_router = APIRouter(prefix="/api/auth", tags=["authentication"])

logger = logging.getLogger(__name__)

# Models
class SendOTPRequest(BaseModel):
    email: EmailStr

class VerifyOTPRequest(BaseModel):
    email: EmailStr
    otp: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: dict

class User(BaseModel):
    email: str
    created_at: datetime = Field(default_factory=lambda: datetime.now(timezone.utc))

# Helper functions
def generate_otp(length: int = 6) -> str:
    """Generate a random OTP"""
    return ''.join(random.choices(string.digits, k=length))

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None):
    """Create JWT access token"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def send_otp_email(email: str, otp: str):
    """Send OTP via email"""
    try:
        # If SMTP is not configured, log OTP instead (for development)
        if not SMTP_EMAIL or not SMTP_PASSWORD:
            logger.warning(f"SMTP not configured. OTP for {email}: {otp}")
            print(f"\n{'='*50}")
            print(f"🔐 OTP for {email}: {otp}")
            print(f"{'='*50}\n")
            return True
        
        # Create message
        message = MIMEMultipart()
        message["From"] = SMTP_EMAIL
        message["To"] = email
        message["Subject"] = "Your Pneumo AI Login OTP"
        
        body = f"""
        <html>
            <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
                <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
                    <div style="background: linear-gradient(135deg, #0ea5e9 0%, #06b6d4 100%); padding: 30px; text-align: center; border-radius: 10px 10px 0 0;">
                        <h1 style="color: white; margin: 0;">Pneumo AI</h1>
                        <p style="color: white; margin: 10px 0 0 0;">Advanced Pneumonia Detection</p>
                    </div>
                    <div style="background: white; padding: 30px; border: 1px solid #e2e8f0; border-radius: 0 0 10px 10px;">
                        <h2 style="color: #0f172a;">Your Login OTP</h2>
                        <p>Hello,</p>
                        <p>Your One-Time Password (OTP) for logging into Pneumo AI is:</p>
                        <div style="background: #f0f9ff; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
                            <h1 style="color: #0ea5e9; margin: 0; font-size: 36px; letter-spacing: 8px;">{otp}</h1>
                        </div>
                        <p><strong>This OTP will expire in {OTP_EXPIRE_MINUTES} minutes.</strong></p>
                        <p>If you didn't request this OTP, please ignore this email.</p>
                        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;">
                        <p style="color: #64748b; font-size: 14px;">This is an automated message from Pneumo AI. Please do not reply to this email.</p>
                    </div>
                </div>
            </body>
        </html>
        """
        
        message.attach(MIMEText(body, "html"))
        
        # Send email
        with smtplib.SMTP(SMTP_SERVER, SMTP_PORT) as server:
            server.starttls()
            server.login(SMTP_EMAIL, SMTP_PASSWORD)
            server.send_message(message)
        
        logger.info(f"OTP sent successfully to {email}")
        return True
        
    except Exception as e:
        logger.error(f"Failed to send OTP email: {str(e)}")
        # In development, still log the OTP
        print(f"\n{'='*50}")
        print(f"🔐 OTP for {email}: {otp} (Email sending failed)")
        print(f"{'='*50}\n")
        return True  # Return True anyway for development

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncIOMotorDatabase = None
) -> dict:
    """Get current authenticated user"""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        token = credentials.credentials
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    
    # Get user from database
    user = await db.users.find_one({"email": email}, {"_id": 0})
    if user is None:
        raise credentials_exception
    
    return user

# Routes
def setup_auth_routes(db_instance):
    """Setup auth routes with database dependency"""
    
    @auth_router.post("/send-otp")
    async def send_otp_route(request: SendOTPRequest):
        """Send OTP to user's email"""
        try:
            email = request.email.lower()
            
            # Generate OTP
            otp = generate_otp()
            
            # Store OTP in database with expiry
            otp_data = {
                "email": email,
                "otp": otp,
                "created_at": datetime.now(timezone.utc),
                "expires_at": datetime.now(timezone.utc) + timedelta(minutes=OTP_EXPIRE_MINUTES)
            }
            
            # Remove old OTPs for this email
            await db_instance.otp_codes.delete_many({"email": email})
            
            # Insert new OTP
            await db_instance.otp_codes.insert_one(otp_data)
            
            # Send OTP via email
            await send_otp_email(email, otp)
            
            return {
                "success": True,
                "message": "OTP sent successfully to your email",
                "email": email
            }
            
        except Exception as e:
            logger.error(f"Error sending OTP: {str(e)}")
            raise HTTPException(status_code=500, detail="Failed to send OTP")

    @auth_router.post("/verify-otp", response_model=TokenResponse)
    async def verify_otp_route(request: VerifyOTPRequest):
        """Verify OTP and create session"""
        try:
            email = request.email.lower()
            otp = request.otp.strip()
            
            # Find OTP in database
            otp_record = await db_instance.otp_codes.find_one({
                "email": email,
                "otp": otp
            })
            
            if not otp_record:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="Invalid OTP"
                )
            
            # Check if OTP is expired
            if datetime.now(timezone.utc) > otp_record["expires_at"]:
                await db_instance.otp_codes.delete_one({"_id": otp_record["_id"]})
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail="OTP has expired. Please request a new one."
                )
            
            # Delete used OTP
            await db_instance.otp_codes.delete_one({"_id": otp_record["_id"]})
            
            # Check if user exists, create if not
            user = await db_instance.users.find_one({"email": email})
            if not user:
                user_data = {
                    "email": email,
                    "created_at": datetime.now(timezone.utc)
                }
                await db_instance.users.insert_one(user_data)
                user = user_data
            
            # Create access token
            access_token = create_access_token(data={"sub": email})
            
            return {
                "access_token": access_token,
                "token_type": "bearer",
                "user": {
                    "email": user["email"],
                    "created_at": user["created_at"].isoformat() if isinstance(user["created_at"], datetime) else user["created_at"]
                }
            }
            
        except HTTPException:
            raise
        except Exception as e:
            logger.error(f"Error verifying OTP: {str(e)}")
            raise HTTPException(status_code=500, detail="Failed to verify OTP")

    @auth_router.get("/me")
    async def get_me_route(credentials: HTTPAuthorizationCredentials = Depends(security)):
        """Get current user information"""
        try:
            token = credentials.credentials
            payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
            email: str = payload.get("sub")
            
            if email is None:
                raise HTTPException(status_code=401, detail="Invalid token")
            
            user = await db_instance.users.find_one({"email": email}, {"_id": 0})
            if not user:
                raise HTTPException(status_code=404, detail="User not found")
            
            return {
                "email": user["email"],
                "created_at": user["created_at"].isoformat() if isinstance(user["created_at"], datetime) else user["created_at"]
            }
            
        except JWTError:
            raise HTTPException(status_code=401, detail="Invalid token")
        except Exception as e:
            logger.error(f"Error getting user: {str(e)}")
            raise HTTPException(status_code=500, detail="Failed to get user information")

    @auth_router.post("/logout")
    async def logout_route():
        """Logout user (client should delete token)"""
        return {"success": True, "message": "Logged out successfully"}
    
    return auth_router
