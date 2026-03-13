import React, { useState, useEffect, useRef } from 'react';
import { MessageCircle, BookMarked, Send, ChevronRight, PlusCircle, Trash2, Copy } from 'lucide-react';
import { GoogleGenerativeAI } from "@google/generative-ai";
// 아까 만든 firebase.js에서 db를 가져옵니다.
import { db } from './firebase'; 
import { collection, addDoc, getDocs, deleteDoc, query, orderBy, doc } from "firebase/firestore";

const genAI = new GoogleGenerativeAI(import.meta.env.VITE_GEMINI_API_KEY);

const App = () => {
  const [messages, setMessages] = useState([
    { role: 'ai', content: '곰방와 소연쨩', isCard: false }
  ]);
  const [input, setInput] = useState('');
  const [quickWords, setQuickWords] = useState([]); 
  const [isLoading, setIsLoading] = useState(false);
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  
  const scrollRef = useRef(null);

  // 1. [Firebase] 데이터 불러오기 (PC/폰 동기화)
  useEffect(() => {
    const fetchWords = async () => {
      try {
        const q = query(collection(db, "words"), orderBy("createdAt", "desc"));
        const querySnapshot = await getDocs(q);
        const words = querySnapshot.docs.map(doc => ({ 
          id: doc.id, 
          ...doc.data() 
        }));
        setQuickWords(words);
      } catch (error) {
        console.error("DB 로드 에러:", error);
      }
    };
    fetchWords();
  }, []);

  // 메시지 자동 스크롤
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  // 2. [Gemini] 스트리밍 답변 및 전송
  const sendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userText = input;
    setInput('');
    setIsLoading(true);

    const newMessages = [...messages, { role: 'user', content: userText }];
    const aiMessageIndex = newMessages.length;
    setMessages([...newMessages, { role: 'ai', content: '', isCard: true }]);

    try {
      // 매니저님 계정에서 확인된 최신 모델 사용
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });
      const prompt = `사용자의 질문: "${userText}"
      위 문장을 일본어로 번역하고 반드시 아래 형식을 엄격히 지켜서 답해줘.
      
      일본어: [일본어 문장]
      입력 방법: [로마자 입력법을 히라가나 한 글자 단위로 띄어서 작성 (예: go ha nn mo u ta be ta)]
      한국어 발음: [한글 발음]
      설명: [상황 설명]`;

      const result = await model.generateContentStream(prompt);
      let fullResponse = "";

      for await (const chunk of result.stream) {
        const chunkText = chunk.text();
        fullResponse += chunkText;
        setMessages(prev => {
          const updated = [...prev];
          updated[aiMessageIndex] = { ...updated[aiMessageIndex], content: fullResponse };
          return updated;
        });
      }
    } catch (error) {
      console.error("AI 에러:", error);
      setMessages(prev => {
        const updated = [...prev];
        updated[aiMessageIndex] = { ...updated[aiMessageIndex], content: "답변 생성 중 오류 발생" };
        return updated;
      });
    } finally {
      setIsLoading(false);
    }
  };

  // 3. [Firebase] 카드 클릭 시 DB에 저장
  const addToSidebar = async (content) => {
    if (!content.includes('일본어:')) return;

    const lines = content.split('\n');
    const newWordData = {
      word: lines.find(l => l.includes('일본어:'))?.replace('일본어:', '').trim() || '',
      input: lines.find(l => l.includes('입력 방법:'))?.replace('입력 방법:', '').trim() || '',
      pronounce: lines.find(l => l.includes('한국어 발음:'))?.replace('한국어 발음:', '').trim() || '',
      desc: lines.find(l => l.includes('설명:'))?.replace('설명:', '').trim() || '',
      createdAt: new Date() 
    };

    try {
      // Firestore 'words' 컬렉션에 저장
      const docRef = await addDoc(collection(db, "words"), newWordData);
      setQuickWords(prev => [{ id: docRef.id, ...newWordData }, ...prev]);
    } catch (error) {
      console.error("DB 저장 에러:", error);
      alert("메모장 저장에 실패했습니다.");
    }
  };

  // 4. [Firebase] DB에서 삭제
  const removeWord = async (id) => {
    try {
      // doc(데이터베이스, "컬렉션이름", "문서ID") 이렇게 3개가 들어가야 합니다.
      await deleteDoc(doc(db, "words", id)); 
      
      // 화면(상태)에서도 즉시 삭제
      setQuickWords(prev => prev.filter(w => w.id !== id));
    } catch (error) {
      console.error("삭제 에러:", error);
    }
  };
  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      alert(`복사 완료: ${text}`);
    }).catch(err => {
      console.error('복사 실패:', err);
    });
  };

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 overflow-hidden font-sans">
      <div className="flex flex-1 flex-col min-w-0">
        <header className="flex items-center justify-between bg-white px-6 py-4 shadow-sm border-b">
          <h1 className="text-xl font-bold text-indigo-600 flex items-center gap-2">
            <MessageCircle className="fill-indigo-600 text-white" /> 한본어 공부방
          </h1>
          <button onClick={() => setSidebarOpen(!isSidebarOpen)} className="md:hidden p-2 hover:bg-slate-100 rounded-full">
            <BookMarked />
          </button>
        </header>

        <main ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map((msg, idx) => (
            <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div 
                onClick={() => msg.isCard && !isLoading && addToSidebar(msg.content)}
                className={`max-w-[85%] rounded-2xl px-4 py-3 shadow-sm transition-all ${
                  msg.role === 'user' ? 'bg-indigo-600 text-white' : 
                  `bg-white border border-slate-200 ${msg.isCard ? 'hover:border-indigo-300 cursor-pointer active:scale-[0.98]' : ''}`
                }`}
              >
                <div className="whitespace-pre-wrap leading-relaxed">{msg.content}</div>
                {msg.isCard && !isLoading && (
                  <div className="mt-2 pt-2 border-t border-slate-100 text-[10px] text-indigo-400 flex items-center justify-end gap-1 font-medium">
                    <PlusCircle size={12} /> 클릭해서 메모장에 추가
                  </div>
                )}
              </div>
            </div>
          ))}
        </main>

        <footer className="p-4 bg-white border-t">
          <div className="flex gap-2 max-w-4xl mx-auto">
            <input 
              className="flex-1 border border-slate-200 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
              placeholder="입력 오네가이"
              disabled={isLoading}
            />
            <button onClick={sendMessage} className="bg-indigo-600 text-white p-3 rounded-xl hover:bg-indigo-700 disabled:bg-slate-300" disabled={isLoading}>
              <Send size={20} />
            </button>
          </div>
        </footer>
      </div>

      <aside className={`
        fixed inset-y-0 right-0 w-80 bg-white border-l shadow-2xl transition-transform duration-300 md:relative md:translate-x-0 md:shadow-none overflow-y-auto z-50
        ${isSidebarOpen ? 'translate-x-0' : 'translate-x-full'}
      `}>
        <div className="p-6">
          <h2 className="text-lg font-bold mb-6 flex items-center justify-between text-slate-800 border-b pb-2">
            <span className="flex items-center gap-2"><BookMarked className="text-indigo-600" /> 와타시 메모장</span>
          </h2>
          <div className="space-y-4">
                      {quickWords.map((item) => (
              <div key={item.id} className="relative p-4 rounded-xl bg-slate-50 border border-slate-100 group">
                {/* 삭제 버튼 */}
                <button 
                  onClick={() => removeWord(item.id)}
                  className="absolute top-2 right-2 text-slate-300 hover:text-red-400 transition-colors"
                >
                  <Trash2 size={14} />
                </button>

                {/* 복사 버튼 추가 */}
                <button 
                  onClick={() => copyToClipboard(item.input)}
                  className="absolute top-2 right-8 text-slate-300 hover:text-indigo-500 transition-colors"
                  title="입력방법 복사"
                >
                  <Copy size={14} />
                </button>

                <div className="font-bold text-indigo-700 mb-1">{item.word}</div>
                <div className="text-[11px] text-slate-500 font-mono bg-white px-2 py-0.5 rounded border border-slate-100 inline-block">
                  {item.input}
                </div>
                <div className="text-xs text-slate-700 mt-2 font-semibold">발음: {item.pronounce}</div>
                <div className="text-[11px] text-slate-400 mt-2 leading-relaxed">{item.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </aside>
      {isSidebarOpen && <div onClick={() => setSidebarOpen(false)} className="fixed inset-0 bg-black/30 z-40 md:hidden backdrop-blur-sm" />}
    </div>
  );
};

export default App;