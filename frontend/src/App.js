import { useState, useEffect, useRef } from "react";
import "@/App.css";
import axios from "axios";
import ReactMarkdown from "react-markdown";
import { Upload, Activity, MessageCircle, X, Send, Loader2, AlertCircle, CheckCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

const TypewriterMessage = ({ content, onComplete }) => {
  const [displayedText, setDisplayedText] = useState("");
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (index < content.length) {
      const timeout = setTimeout(() => {
        setDisplayedText((prev) => prev + content[index]);
        setIndex((prev) => prev + 1);
      }, 5); // Speed of typing
      return () => clearTimeout(timeout);
    } else if (onComplete) {
      onComplete();
    }
  }, [index, content, onComplete]);

  return (
    <div className="prose prose-sm max-w-none">
      <ReactMarkdown>{displayedText}</ReactMarkdown>
    </div>
  );
};

function App() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [result, setResult] = useState(null);
  const [showChat, setShowChat] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const [sessionId] = useState(() => `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`);
  const [history, setHistory] = useState([]);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      const response = await axios.get(`${API}/analysis-history`);
      setHistory(response.data.slice(0, 5));
    } catch (error) {
      console.error("Error loading history:", error);
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        toast.error("Please select an image file");
        return;
      }
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setResult(null);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file && file.type.startsWith('image/')) {
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setResult(null);
    }
  };

  const analyzeXray = async () => {
    if (!selectedFile) {
      toast.error("Please select an X-ray image first");
      return;
    }

    setAnalyzing(true);
    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const response = await axios.post(`${API}/analyze-xray`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      setResult(response.data);
      toast.success("Analysis completed successfully");
      await loadHistory();
    } catch (error) {
      console.error("Analysis error:", error);
      toast.error("Failed to analyze X-ray. Please try again.");
    } finally {
      setAnalyzing(false);
    }
  };

  const sendChatMessage = async () => {
    if (!chatInput.trim()) return;

    const userMessage = { role: "user", content: chatInput };
    setChatMessages(prev => [...prev, userMessage]);
    setChatInput("");
    setSendingMessage(true);

    try {
      const response = await axios.post(`${API}/chat`, {
        session_id: sessionId,
        message: chatInput
      });

      const aiMessage = { role: "assistant", content: response.data.message };
      setChatMessages(prev => [...prev, aiMessage]);
    } catch (error) {
      console.error("Chat error:", error);
      toast.error("Failed to send message");
    } finally {
      setSendingMessage(false);
    }
  };

  const getStageColor = (stage) => {
    if (!stage) return "bg-gray-100 text-gray-800";
    switch(stage) {
      case "1": return "bg-yellow-100 text-yellow-800";
      case "2": return "bg-orange-100 text-orange-800";
      case "3": return "bg-red-100 text-red-800";
      default: return "bg-gray-100 text-gray-800";
    }
  };

  const getStatusIcon = (hasPneumonia) => {
    return hasPneumonia ? (
      <AlertCircle className="w-6 h-6 text-red-500" />
    ) : (
      <CheckCircle className="w-6 h-6 text-green-500" />
    );
  };

  return (
    <div className="app-container">
      {/* Header */}
      <header className="header">
        <div className="header-content">
          <div className="logo-section">
            <Activity className="logo-icon" />
            <h1 className="logo-text">Pneumo AI</h1>
          </div>
          <p className="tagline">Advanced Pneumonia Detection & Care Assistant</p>
        </div>
      </header>

      {/* Main Content */}
      <main className="main-content">
        <div className="content-wrapper">
          {/* Upload Section */}
          <div className="upload-section">
            <Card className="upload-card" data-testid="upload-card">
              <CardHeader>
                <CardTitle className="card-title">Upload Chest X-Ray</CardTitle>
                <CardDescription>Upload a chest X-ray image for AI-powered pneumonia detection</CardDescription>
              </CardHeader>
              <CardContent>
                <div 
                  className="dropzone"
                  onDrop={handleDrop}
                  onDragOver={(e) => e.preventDefault()}
                  onClick={() => document.getElementById('file-input').click()}
                  data-testid="dropzone"
                >
                  <input
                    id="file-input"
                    type="file"
                    accept="image/*"
                    onChange={handleFileSelect}
                    style={{ display: 'none' }}
                    data-testid="file-input"
                  />
                  {previewUrl ? (
                    <div className="preview-container">
                      <img src={previewUrl} alt="X-ray preview" className="preview-image" data-testid="preview-image" />
                    </div>
                  ) : (
                    <div className="upload-placeholder">
                      <Upload className="upload-icon" />
                      <p className="upload-text">Drop X-ray image here or click to browse</p>
                      <p className="upload-hint">Supports JPG, PNG, WEBP</p>
                    </div>
                  )}
                </div>
                
                <Button 
                  onClick={analyzeXray} 
                  disabled={!selectedFile || analyzing}
                  className="analyze-button"
                  data-testid="analyze-button"
                >
                  {analyzing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Analyzing...
                    </>
                  ) : (
                    'Analyze X-Ray'
                  )}
                </Button>
              </CardContent>
            </Card>

            {/* Results Section */}
            {result && (
              <Card className="results-card" data-testid="results-card">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    {getStatusIcon(result.has_pneumonia)}
                    Analysis Results
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="result-item">
                    <span className="result-label">Status:</span>
                    <span className={`result-badge ${result.has_pneumonia ? 'badge-negative' : 'badge-positive'}`} data-testid="result-status">
                      {result.has_pneumonia ? 'Pneumonia Detected' : 'No Pneumonia Detected'}
                    </span>
                  </div>
                  
                  {result.has_pneumonia && result.stage && (
                    <>
                      <div className="result-item">
                        <span className="result-label">Stage:</span>
                        <span className={`stage-badge ${getStageColor(result.stage)}`} data-testid="result-stage">
                          Stage {result.stage}
                        </span>
                      </div>
                      
                      <div className="result-item">
                        <span className="result-label">Classification:</span>
                        <span className="result-value" data-testid="result-stage-name">{result.stage_name}</span>
                      </div>
                    </>
                  )}
                  
                  <div className="result-item">
                    <span className="result-label">Confidence:</span>
                    <span className="result-value" data-testid="result-confidence">{result.confidence}</span>
                  </div>
                  
                  <div className="result-details">
                    <p className="result-label mb-2">Clinical Observations:</p>
                    <p className="result-text" data-testid="result-details">{result.analysis_details}</p>
                  </div>

                  <div className="disclaimer">
                    <AlertCircle className="w-4 h-4" />
                    <p>This is an AI-assisted analysis. Please consult a healthcare professional for accurate diagnosis.</p>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Sidebar */}
          <div className="sidebar">
            {/* Chat Assistant Card */}
            <Card className="chat-card" data-testid="chat-card">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <MessageCircle className="w-5 h-5" />
                  AI Care Assistant
                </CardTitle>
                <CardDescription>Ask questions about pneumonia prevention and care</CardDescription>
              </CardHeader>
              <CardContent>
                <Button 
                  onClick={() => setShowChat(!showChat)} 
                  className="chat-toggle-button"
                  data-testid="chat-toggle-button"
                >
                  {showChat ? 'Close Chat' : 'Start Conversation'}
                </Button>
              </CardContent>
            </Card>

            {/* Recent Analysis History */}
            {history.length > 0 && (
              <Card className="history-card">
                <CardHeader>
                  <CardTitle>Recent Analyses</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="history-list">
                    {history.map((item, idx) => (
                      <div key={item.id || idx} className="history-item" data-testid={`history-item-${idx}`}>
                        <div className="history-status">
                          {getStatusIcon(item.has_pneumonia)}
                          <span className="history-text">
                            {item.has_pneumonia ? `Stage ${item.stage}` : 'Clear'}
                          </span>
                        </div>
                        <span className="history-time">
                          {new Date(item.timestamp).toLocaleDateString()}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </main>

      {/* Chat Modal */}
      {showChat && (
        <div className="chat-modal-overlay" data-testid="chat-modal">
          <div className="chat-modal">
            <div className="chat-header">
              <div className="flex items-center gap-2">
                <MessageCircle className="w-5 h-5" />
                <h3 className="chat-title">AI Care Assistant</h3>
              </div>
              <button onClick={() => setShowChat(false)} className="close-button" data-testid="close-chat-button">
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <ScrollArea className="chat-messages" data-testid="chat-messages">
              {chatMessages.length === 0 ? (
                <div className="chat-empty">
                  <MessageCircle className="w-12 h-12 text-gray-300" />
                  <p>Start a conversation about pneumonia prevention and care</p>
                </div>
              ) : (
                chatMessages.map((msg, idx) => (
                  <div key={idx} className={`chat-message ${msg.role}`} data-testid={`chat-message-${idx}`}>
                    <div className="message-bubble">
                      {msg.role === "assistant" && idx === chatMessages.length - 1 && !msg.completed ? (
                        <TypewriterMessage 
                          content={msg.content} 
                          onComplete={() => {
                            const newMessages = [...chatMessages];
                            newMessages[idx].completed = true;
                            setChatMessages(newMessages);
                          }}
                        />
                      ) : (
                        <div className="prose prose-sm max-w-none">
  <ReactMarkdown>{msg.content}</ReactMarkdown>
</div>
                      )}
                    </div>
                  </div>
                ))
              )}
              {sendingMessage && (
                <div className="chat-message assistant">
                  <div className="message-bubble">
                    <Loader2 className="w-4 h-4 animate-spin" />
                  </div>
                </div>
              )}
            </ScrollArea>
            
            <div className="chat-input-container">
              <Input
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && !sendingMessage && sendChatMessage()}
                placeholder="Ask about pneumonia..."
                disabled={sendingMessage}
                className="chat-input"
                data-testid="chat-input"
              />
              <Button 
                onClick={sendChatMessage} 
                disabled={!chatInput.trim() || sendingMessage}
                className="send-button"
                data-testid="send-message-button"
              >
                <Send className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;