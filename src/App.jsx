import React, { useState, useEffect } from 'react';
import { Search, BookMarked, Volume2, Plus, Check, LibraryBig, ChevronDown, ChevronUp, Star, RefreshCw, LogOut, Gamepad2, Pause, Play, ChevronRight, Sun, Moon, Trash2 } from 'lucide-react';
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { auth, db } from './firebase';
import { signInWithEmailAndPassword, onAuthStateChanged, signOut } from 'firebase/auth';
import { collection, doc, setDoc, updateDoc, onSnapshot, deleteDoc } from 'firebase/firestore';
import './index.css';

// =========================================================================
// COMPONENT CHÍNH
// =========================================================================
export default function App() {
  const [user, setUser] = useState(null); // Trạng thái đăng nhập Firebase
  const [authLoading, setAuthLoading] = useState(true);

  const [isDarkMode, setIsDarkMode] = useState(() => {
    if (localStorage.getItem('theme') === 'dark') return true;
    if (localStorage.getItem('theme') === 'light') return false;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  });

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
      document.body.className = 'bg-gray-900 text-gray-100 transition-colors duration-300';
      localStorage.setItem('theme', 'dark');
    } else {
      document.documentElement.classList.remove('dark');
      document.body.className = 'bg-gray-50 text-gray-800 transition-colors duration-300';
      localStorage.setItem('theme', 'light');
    }
  }, [isDarkMode]);

  const [searchTerm, setSearchTerm] = useState('');
  const [results, setResults] = useState([]);
  const [savedWords, setSavedWords] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('search'); // 'search' | 'saved'

  // Trạng thái cho tính năng Gợi ý Trực tiếp
  const [suggestions, setSuggestions] = useState([]);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [suppressSuggest, setSuppressSuggest] = useState(false); // Ngăn trigger API Suggest sau khi đã chọn kết quả
  const [expandedExamples, setExpandedExamples] = useState({}); // Quản lý trạng thái mở dropdown ví dụ
  const [filterRating, setFilterRating] = useState('All'); // Bộ lọc cấp độ sao (All, 1,2,3,4,5)
  const [searchTermSaved, setSearchTermSaved] = useState(''); // Text search cục bộ trong thư viện
  const [visibleCount, setVisibleCount] = useState(20);

  // Reset pagination khi chuyển tab, đổi filter hoặc text search
  useEffect(() => {
    setVisibleCount(20);
  }, [activeTab, filterRating, searchTermSaved]);

  // Infinite Scroll logic
  useEffect(() => {
    if (activeTab !== 'saved') return;

    const handleScroll = () => {
      // Cách đáy 100px thì load thêm
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 100) {
        setVisibleCount(prev => prev + 20);
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, [activeTab]);

  // Lắng nghe trạng thái đăng nhập Firebase
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Gọi API Gợi ý (Autocomplete) mỗi khi người dùng gõ phím
  useEffect(() => {
    // Chỉ gọi khi có >= 2 ký tự và không bị khóa
    if (!searchTerm.trim() || searchTerm.trim().length < 2 || suppressSuggest) {
      setSuggestions([]);
      setShowSuggestions(false);
      return;
    }

    // Debounce timeout để tránh gọi API liên tục khi đang type
    const delayDebounceFn = setTimeout(async () => {
      setIsSuggesting(true);
      try {
        const res = await fetch(`/api/suggest?keyword=${encodeURIComponent(searchTerm)}`);
        if (res.ok) {
          const data = await res.json();
          if (data && data.data && data.data.length > 0) {
            setSuggestions(data.data);
            setShowSuggestions(true);
          } else {
            setSuggestions([]);
            setShowSuggestions(false);
          }
        }
      } catch (err) {
        console.error("Lỗi fetch suggest API:", err);
      } finally {
        setIsSuggesting(false);
      }
    }, 400);

    return () => clearTimeout(delayDebounceFn);
  }, [searchTerm]);

  // Sử dụng Realtime Listener (onSnapshot) kéo dữ liệu từ vựng về máy User từ Firestore.
  useEffect(() => {
    if (user) {
      const vocabRef = collection(db, "artifacts/china-vocab/users", user.uid, "vocabulary");

      const unsubscribe = onSnapshot(vocabRef, (snapshot) => {
        const words = [];
        snapshot.forEach((docSnap) => {
          words.push(docSnap.data());
        });
        // Sắp xếp giảm dần theo thời gian tạo (từ mới tạo nằm trên)
        words.sort((a, b) => b.createdAt - a.createdAt);
        setSavedWords(words);
      });

      return () => unsubscribe();
    } else {
      setSavedWords([]);
    }
  }, [user]);

  // Lưu từ vựng lên Firebase
  const saveWord = async (wordObj, contentItem = null, meanItem = null, contentIndex = 0, meanIndex = 0) => {
    if (!user) return alert("Vui lòng đăng nhập trước khi lưu từ vựng!");

    // If saving specific meaning, create a unique ID based on the word ID and meaning indices
    let saveId = wordObj.id;
    let wordData = {
      ...wordObj,
      rating: 1,
      createdAt: Date.now()
    };

    if (contentItem && meanItem) {
      saveId = `${wordObj.id}_${contentIndex}_${meanIndex}`;

      // Construct simplified payload for specific meaning
      wordData = {
        id: saveId,
        originalId: wordObj.id,
        word: wordObj.word,
        pinyin: wordObj.pinyin || wordObj.zhuyin,
        cn_vi: wordObj.cn_vi,
        kind: contentItem.kind || '',
        meaning: meanItem.mean || meanItem.explain,
        explain: meanItem.explain || '',
        examples: meanItem.examples || [],
        rating: 1,
        createdAt: Date.now(),
        isSpecificMeaning: true // flag for backward compatibility
      };
    }

    if (!savedWords.find(w => w.id === saveId)) {
      try {
        const wordRef = doc(db, "artifacts/china-vocab/users", user.uid, "vocabulary", saveId.toString());
        await setDoc(wordRef, wordData);
      } catch (err) {
        console.error("Lỗi khi lưu từ: ", err);
      }
    }
  };
  // Cập nhật điểm đánh giá cho từ (1-5 sao)
  const updateRating = async (id, newRating) => {
    if (!user) return;
    try {
      const wordRef = doc(db, "artifacts/china-vocab/users", user.uid, "vocabulary", id.toString());
      await updateDoc(wordRef, { rating: newRating });
    } catch (err) {
      console.error("Lỗi khi cập nhật hạng sao:", err);
    }
  };

  // Nút Xoá từ
  const deleteWord = async (wordId) => {
    if (window.confirm('Bạn có chắc chắn muốn xóa từ vựng này khỏi sổ tay? Thao tác này không thể hoàn tác.')) {
      try {
        const wordRef = doc(db, "artifacts/china-vocab/users", user.uid, "vocabulary", wordId.toString());
        await deleteDoc(wordRef);

        // Cập nhật lại state danh sách từ
        setSavedWords(prev => prev.filter(w => w.id !== wordId));
        console.log(`Đã xóa từ ${wordId}`);
      } catch (error) {
        console.error('Lỗi khi xóa từ:', error);
        alert('Không thể xóa từ này. Vui lòng thử lại.');
      }
    }
  };

  // =========================================================================
  // LOGIC TÌM KIẾM
  // =========================================================================
  const handleSearch = async (e) => {
    e.preventDefault();
    if (!searchTerm.trim()) return;

    setIsLoading(true);
    setResults([]);

    try {
      // SỬA TẠI ĐÂY: Thay 'http://localhost:3000/api/search' bằng '/api/search'
      // Nhờ file netlify.toml, Netlify sẽ tự điều hướng /api/search về Function của bạn
      const response = await fetch(`/api/search?word=${encodeURIComponent(searchTerm)}`);

      if (!response.ok) {
        throw new Error(`Error: ${response.status}`);
      }

      const data = await response.json();

      console.log("Hanzii API Full Response:", data);

      if (data && data.result) {
        setResults(data.result);
      } else {
        setResults([]);
        console.warn("Không tìm thấy kết quả hợp lệ từ backend", data);
      }
    } catch (error) {
      console.error("Lỗi gọi API:", error);
      // CẬP NHẬT THÔNG BÁO: Không còn nhắc đến Port 3000 nữa
      alert("Lỗi khi tìm kiếm, vui lòng kiểm tra kết nối mạng hoặc cấu hình Netlify Functions.");
    } finally {
      setIsLoading(false);
    }
  };

  // Phát âm (Sử dụng Web Speech API có sẵn của trình duyệt)
  const playAudio = (text) => {
    // Xóa hàng chờ đang phát cũ để tránh lỗi phát bị đúp/lặp lại
    window.speechSynthesis.cancel();
    const msg = new SpeechSynthesisUtterance();
    msg.text = text;
    msg.lang = 'zh-CN';
    window.speechSynthesis.speak(msg);
  };

  const handleSearchWord = (word) => {
    setSearchTerm(word);
    // Kích hoạt form submit giả để gọi lại hàm search
    setTimeout(() => {
      const form = document.getElementById("searchForm");
      if (form) form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
    }, 0);
  };

  // =========================================================================
  // GIAO DIỆN HIỂN THỊ
  // =========================================================================
  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50"><div className="animate-spin rounded-full h-12 w-12 border-4 border-red-500 border-t-transparent"></div></div>;
  }

  if (!user) {
    return <LoginScreen />;
  }

  return (
    <div className={`min-h-screen ${isDarkMode ? 'dark' : ''} bg-gray-50 dark:bg-gray-900 text-gray-800 dark:text-gray-100 font-sans selection:bg-indigo-300 dark:selection:bg-indigo-700 transition-colors duration-300`}>

      {/* HEADER TÙY CHỈNH */}
      {activeTab !== 'review' && (
        <header className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-md shadow-sm sticky top-0 z-[100] border-b border-gray-100 dark:border-gray-800 transition-colors duration-300">
          <div className="max-w-4xl mx-auto px-4 py-3 flex flex-col sm:flex-row justify-between items-center gap-3">
            <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 min-w-0 transition-colors">
              <BookMarked size={22} className="shrink-0" />
              <span className="truncate text-base sm:text-lg font-bold" title={user?.email}>
                Xin chào, {user?.email?.split('@')[0]}
              </span>
            </div>

            <div className="flex bg-gray-100/80 dark:bg-gray-800 p-1 rounded-lg shrink-0 overflow-x-auto max-w-full items-center transition-colors">
              <button
                onClick={() => setActiveTab('search')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${activeTab === 'search' ? 'bg-white dark:bg-gray-700 shadow text-indigo-600 dark:text-indigo-400' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`}
              >
                Tra Từ
              </button>
              <button
                onClick={() => setActiveTab('saved')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors flex items-center gap-1 ${activeTab === 'saved' ? 'bg-white dark:bg-gray-700 shadow text-indigo-600 dark:text-indigo-400' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200'}`}
              >
                <LibraryBig size={16} />
                Sổ Tay
              </button>

              <div className="w-px h-5 bg-gray-300 dark:bg-gray-600 mx-1"></div>

              <button
                onClick={() => setIsDarkMode(!isDarkMode)}
                title="Đổi giao diện"
                className="px-3 py-2 rounded-md text-gray-500 hover:text-yellow-500 dark:text-gray-400 dark:hover:text-yellow-400 transition-colors"
              >
                {isDarkMode ? <Sun size={16} /> : <Moon size={16} />}
              </button>

              <button
                onClick={() => {
                  if (window.confirm("Bạn có chắc chắn muốn đăng xuất không?")) {
                    signOut(auth);
                  }
                }}
                title="Đăng xuất"
                className="ml-1 px-3 py-2 rounded-md text-sm font-medium transition-colors text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/40 dark:hover:text-red-400 flex items-center gap-1"
              >
                <LogOut size={16} />
                <span className="hidden sm:inline truncate max-w-[50px]">Thoát</span>
              </button>
            </div>
          </div>
        </header>
      )}

      <main className="max-w-4xl mx-auto px-4 py-8">

        {/* --- TAB TRA TỪ --- */}
        {activeTab === 'search' && (
          <div className="space-y-6">

            {/* Thanh Tìm Kiếm */}
            <form id="searchForm" onSubmit={handleSearch} className="relative z-50">
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => {
                  setSearchTerm(e.target.value);
                  setSuppressSuggest(false); // Reset cờ chặn
                  // Khi user chủ động gõ phím thay đổi thì mới cho phép dropdown xuất hiện lại (nếu có suggest)
                  if (!showSuggestions && e.target.value.trim().length >= 2) {
                    setShowSuggestions(true);
                  }
                }}
                onFocus={() => {
                  // Bỏ trigger tự động mở popup khi focus nếu không có tương tác phím
                }}
                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                placeholder="Tra cứu Hán tự, Pinyin, hoặc tiếng Việt..."
                className="w-full pl-12 pr-4 py-4 rounded-2xl border-2 border-gray-200 dark:border-gray-700 dark:bg-gray-800 dark:text-white focus:border-indigo-500 focus:outline-none focus:ring-4 focus:ring-indigo-100 dark:focus:ring-indigo-900/50 text-lg transition-all relative z-10 shadow-sm"
              />
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 z-20" size={24} />
              <button
                type="submit"
                className="absolute right-3 top-1/2 -translate-y-1/2 bg-indigo-600 text-white px-5 py-2.5 rounded-xl hover:bg-indigo-700 font-medium transition-colors shadow-md hover:shadow-lg z-20"
                disabled={isLoading}
              >
                Tra cứu
              </button>

              {/* Dropdown Gợi Ý */}
              {showSuggestions && suggestions.length > 0 && (
                <div className="absolute top-[100%] mt-2 left-0 right-0 bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-100 dark:border-gray-700 overflow-hidden z-[100] animate-in fade-in slide-in-from-top-2 duration-200">
                  {isSuggesting && (
                    <div className="px-4 py-2 text-sm text-gray-400 dark:text-gray-500 text-center animate-pulse border-b border-gray-50 dark:border-gray-700">Đang tìm gợi ý...</div>
                  )}
                  <div className="max-h-[300px] overflow-y-auto">
                    {suggestions.map((sug, idx) => {
                      // format API trả về: "你好#nihao#nǐ hǎo!#chào bạn"
                      const parts = sug.split('#');
                      const word = parts[0] || '';
                      const pinyin = parts[2] || parts[1] || '';
                      const mean = parts[3] || '';

                      return (
                        <div
                          key={idx}
                          onClick={() => {
                            setSuppressSuggest(true); // Khóa quyền lấy suggest cho giá trị update tiếp theo
                            setSearchTerm(word);
                            setShowSuggestions(false);
                            setSuggestions([]); // Xóa list gợi ý để lần focus tiếp theo không hiện lại
                            // Tự động gọi hàm tính kiếm ngay sau khi bấm vào gợi ý
                            setTimeout(() => {
                              const form = document.getElementById("searchForm");
                              if (form) form.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
                            }, 50);
                          }}
                          className="px-4 py-3 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 cursor-pointer flex justify-between items-center border-b border-gray-50 dark:border-gray-700/50 last:border-0 transition-colors group"
                        >
                          <div className="flex items-center gap-3">
                            <Search size={14} className="text-gray-300 dark:text-gray-600 group-hover:text-indigo-400 dark:group-hover:text-indigo-300 transition-colors" />
                            <span className="text-[17px] font-bold text-gray-800 dark:text-gray-100 transition-colors">{word}</span>
                            {pinyin && <span className="text-sm font-medium text-indigo-600 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/50 px-2 py-0.5 rounded-md border border-indigo-100 dark:border-indigo-800 transition-colors">{pinyin}</span>}
                          </div>
                          <div className="text-sm text-gray-500 dark:text-gray-400 truncate max-w-[40%] text-right font-medium transition-colors">{mean}</div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}
            </form>

            {/* Loading State */}
            {isLoading && (
              <div className="flex justify-center items-center py-12">
                <div className="animate-spin rounded-full h-10 w-10 border-4 border-red-500 border-t-transparent"></div>
              </div>
            )}

            {/* Kết Quả */}
            {!isLoading && results.length > 0 && (
              <div className="space-y-4">
                {results.slice(0, 1).map((item, index) => (
                  <WordCard
                    key={item.id || index}
                    item={item}
                    savedWords={savedWords} // Pass savedWords for checking specific meanings
                    onSave={(itemToSave, contentBlock, meanObj, contentIdx, meanIdx) => saveWord(itemToSave, contentBlock, meanObj, contentIdx, meanIdx)}
                    onPlay={() => playAudio(item.word)}
                    onSearchWord={handleSearchWord}
                  />
                ))}
              </div>
            )}

            {!isLoading && results.length === 0 && searchTerm && (
              <div className="text-center py-12 text-gray-500">
                Không tìm thấy kết quả cho "{searchTerm}". Thử tra "kết hôn" hoặc "结婚" xem sao nhé.
              </div>
            )}
          </div>
        )}

        {/* --- TAB ÔN TẬP --- */}
        {activeTab === 'review' && (
          <ReviewScreen
            savedWords={savedWords}
            updateRating={updateRating}
            playAudio={playAudio}
            setActiveTab={setActiveTab}
          />
        )}

        {/* --- TAB SỔ TAY TỪ VỰNG --- */}
        {activeTab === 'saved' && (
          <div className="flex flex-col gap-6">
            <h2 className="text-2xl font-bold text-gray-800 dark:text-gray-100 border-b border-gray-200 dark:border-gray-700 pb-2 transition-colors">Sổ Tay Từ Vựng Của Bạn</h2>

            {savedWords.length === 0 ? (
              <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 transition-colors">
                <LibraryBig size={48} className="mx-auto text-gray-300 dark:text-gray-500 mb-4 transition-colors" />
                <p className="text-gray-500 dark:text-gray-400 font-medium transition-colors">Bạn chưa lưu từ vựng nào.</p>
                <p className="text-sm text-gray-400 dark:text-gray-500 mt-1 transition-colors">Hãy tra từ và nhấn "Lưu từ" để thêm vào đây nhé.</p>
              </div>
            ) : (
              <>
                {/* --- DASHBOARD THỐNG KÊ --- */}
                {(() => {
                  // Đếm từ vựng theo rank
                  const rankCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
                  savedWords.forEach(w => {
                    const r = w.rating || 1;
                    rankCounts[r] = (rankCounts[r] || 0) + 1;
                  });

                  // Format cho Recharts (Đã Việt Hóa)
                  const dataMapping = [
                    { name: 'Mới', star: 1, count: rankCounts[1], fill: '#FF6B6B' },
                    { name: 'Đang học', star: 2, count: rankCounts[2], fill: '#FFB84D' },
                    { name: 'Quen', star: 3, count: rankCounts[3], fill: '#FFD93D' },
                    { name: 'Ổn', star: 4, count: rankCounts[4], fill: '#6BCB77' },
                    { name: 'Nắm vững', star: 5, count: rankCounts[5], fill: '#4D96FF' }
                  ];

                  return (
                    <div className="bg-white dark:bg-gray-800 p-6 rounded-3xl border border-gray-100 dark:border-gray-700 shadow-md relative overflow-hidden group transition-all duration-300">
                      {/* Tiêu đề Chart */}
                      <div className="flex justify-between items-start mb-6">
                        <div>
                          <h3 className="text-xl font-extrabold text-gray-900 dark:text-gray-100 flex items-center gap-2 transition-colors">
                            Tiến độ học tập <RefreshCw size={18} className="text-indigo-500 dark:text-indigo-400 group-hover:rotate-180 transition-transform duration-500" />
                          </h3>
                          <p className="text-gray-500 dark:text-gray-400 text-sm mt-1 transition-colors">Theo dõi mức độ nhớ từ vựng.</p>
                        </div>
                        <div className="text-right">
                          <span className="text-4xl gap-1 font-black text-indigo-600 dark:text-indigo-400 tracking-tight transition-colors">{savedWords.length}</span>
                          <span className="block text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mt-1 transition-colors">Tổng số từ</span>
                        </div>
                      </div>

                      {/* Biểu Đồ Recharts */}
                      <div className="h-[250px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={dataMapping} margin={{ top: 20, right: 10, left: 10, bottom: 25 }} barCategoryGap="30%" barSize={20}>
                            <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#9CA3AF', fontSize: 12, fontWeight: 600 }} dy={10} interval={0} />
                            <Tooltip cursor={{ fill: 'transparent' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)', fontWeight: 'bold' }} />
                            <Bar dataKey="count" radius={[6, 6, 6, 6]}>
                              {dataMapping.map((entry, index) => (
                                <Cell key={`cell-${index}`} fill={entry.fill} />
                              ))}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  );
                })()}

                {/* --- TRÌNH XỬ LÝ LỌC TỪ VỰNG --- */}
                <div className="flex justify-end mb-4">
                  <button
                    onClick={() => setActiveTab('review')}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-3 px-8 rounded-xl flex items-center gap-2 shadow-lg shadow-indigo-600/20 transition-all hover:-translate-y-0.5 w-full sm:w-auto justify-center"
                  >
                    <Gamepad2 size={20} />
                    Ôn tập ngay
                  </button>
                </div>

                <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-gray-50 dark:bg-gray-800/50 p-2 rounded-2xl border border-gray-100 dark:border-gray-700 transition-colors">
                  <div className="relative w-full sm:w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 transition-colors" size={18} />
                    <input
                      type="text"
                      value={searchTermSaved}
                      onChange={(e) => setSearchTermSaved(e.target.value)}
                      placeholder="Tìm từ, pinyin hoặc nghĩa..."
                      className="w-full pl-10 pr-4 py-2.5 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-indigo-100 dark:focus:ring-indigo-900/50 text-sm font-medium transition-colors"
                    />
                  </div>

                  <div className="flex gap-2 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0 scrollbar-hide shrink-0 px-1">
                    {['Tất cả', '1 sao (Mới)', '2 sao', '3 sao', '4 sao', '5 sao (Thuộc)'].map((label, idx) => {
                      const value = idx === 0 ? 'All' : idx;
                      const isActive = filterRating === value;
                      return (
                        <button
                          key={label}
                          onClick={() => setFilterRating(value)}
                          className={`px-4 py-2.5 rounded-xl text-sm font-bold whitespace-nowrap transition-all ${isActive ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200 dark:shadow-indigo-900/20' : 'bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-200 dark:border-gray-700'}`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* --- LƯỚI TỪ VỰNG FILTER --- */}
                {(() => {
                  // Lọc theo Text (Pinyin loại dấu, chữ Hán, chữ Việt) & Lọc theo Sao
                  const removeTones = (str) => {
                    if (!str) return "";
                    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
                  };

                  const searchStr = removeTones(searchTermSaved).trim();

                  const filteredWords = savedWords.filter(w => {
                    // Check sao
                    const passRating = filterRating === 'All' || (w.rating || 1) === filterRating;
                    // Check search text (>= 3 chars for Pinyin match roughly, or direct match)
                    let passSearch = true;
                    if (searchStr.length > 0) {
                      const wordText = removeTones(w.word);
                      const pinyinText = removeTones(w.pinyin || w.zhuyin);
                      // For specific meanings, search in 'meaning' field, otherwise in 'cn_vi'
                      const vietText = removeTones(w.isSpecificMeaning ? w.meaning : w.cn_vi);

                      passSearch = wordText.includes(searchStr) ||
                        pinyinText.includes(searchStr) ||
                        vietText.includes(searchStr);
                    }

                    return passRating && passSearch;
                  });

                  if (filteredWords.length === 0) {
                    return <div className="text-center py-8 text-gray-400 dark:text-gray-500 font-medium transition-colors">Không tìm thấy từ vựng nào ở cấp độ này.</div>
                  }

                  return (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-start">
                      {filteredWords.slice(0, visibleCount).map((item) => {
                        // Lấy định nghĩa đầu tiên làm chính (for old structure)
                        const firstContent = item.content?.[0];
                        const firstMean = firstContent?.means?.[0];
                        const mainMeaning = item.isSpecificMeaning ? item.meaning : (firstMean?.mean || firstMean?.explain || item.cn_vi);
                        const examples = item.isSpecificMeaning ? item.examples : (firstMean?.examples || []);
                        const wordKind = item.isSpecificMeaning ? item.kind : firstContent?.kind;
                        const explainText = item.isSpecificMeaning ? item.explain : firstMean?.explain;
                        const showExplain = explainText && explainText !== mainMeaning;
                        const isExpanded = !!expandedExamples[item.id];

                        return (
                          <div key={item.id} className="bg-white dark:bg-gray-800 p-4 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-700 relative group flex flex-col h-fit hover:shadow-md hover:-translate-y-0.5 transition-all duration-300">
                            {/* Header chính: Chữ Hán, Pinyin nằm trái; Các nút nằm phải */}
                            <div className="flex items-start justify-between border-b border-gray-100 dark:border-gray-700 pb-2 mb-2 transition-colors">
                              <div className="flex flex-col mt-0.5">
                                <div className="flex items-baseline gap-2">
                                  <span className="text-2xl font-bold text-gray-800 dark:text-gray-100 transition-colors">{item.word}</span>
                                  <span className="text-sm font-medium text-indigo-600 dark:text-indigo-400 transition-colors">
                                    [{item.pinyin || item.zhuyin}] {wordKind ? `(${wordKind})` : ''}
                                  </span>
                                </div>
                              </div>

                              <div className="flex flex-col items-end gap-1">
                                {/* Vùng Top Right: Đánh giá Sao */}
                                <div className="flex items-center gap-2 mt-0.5">
                                  <div className="flex gap-0.5">
                                    {[1, 2, 3, 4, 5].map((starIdx) => (
                                      <Star
                                        key={starIdx}
                                        size={14}
                                        onClick={() => updateRating(item.id, starIdx)}
                                        className={starIdx <= (item.rating || 1) ? "fill-yellow-400 text-yellow-400 cursor-pointer" : "text-gray-200 dark:text-gray-600 cursor-pointer hover:text-yellow-300 transition-colors"}
                                      />
                                    ))}
                                  </div>
                                </div>

                                {/* Nút Nghe & Nút Xem thêm */}
                                <div className="flex items-center gap-1">
                                  <button onClick={() => playAudio(item.word)} className="text-indigo-500 dark:text-indigo-400 p-1.5 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-full transition-colors font-medium border border-transparent hover:border-indigo-100 dark:hover:border-indigo-800/50" title="Nghe phát âm">
                                    <Volume2 size={16} />
                                  </button>
                                  <button
                                    onClick={() => setExpandedExamples(prev => ({ ...prev, [item.id]: !prev[item.id] }))}
                                    className="text-indigo-500 dark:text-indigo-400 p-1.5 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-full transition-colors border border-transparent hover:border-indigo-100 dark:hover:border-indigo-800/50"
                                    title="Xem nghĩa và ví dụ"
                                  >
                                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                                  </button>
                                </div>
                              </div>
                            </div>

                            {/* Nội dung xổ ra: Nghĩa, Giải thích & 1 Ví dụ */}
                            {isExpanded && (
                              <div className="mt-1 space-y-3 pt-2 transition-colors">
                                {/* Nghĩa Tiếng Việt & Giải thích */}
                                <div>
                                  {/* Tùy chọn Xóa từ (hiển thị cùng lúc với phần Nghĩa) */}
                                  <div className="flex justify-between items-start">
                                    <div className="flex-1">
                                      <h3 className="text-base font-bold text-gray-900 dark:text-gray-200 mb-0.5 leading-snug capitalize text-indigo-700 dark:text-indigo-300 transition-colors">
                                        {mainMeaning}
                                      </h3>

                                      {/* Only show explain if explain is different from meaning */}
                                      {showExplain && (
                                        <div className="mt-2 p-2.5 bg-gray-50 dark:bg-gray-900/50 rounded-lg text-gray-700 dark:text-gray-400 text-sm border-l-2 border-gray-300 dark:border-gray-600 transition-colors">
                                          {explainText}
                                        </div>
                                      )}
                                    </div>
                                    <button
                                      onClick={() => deleteWord(item.id)}
                                      className="ml-2 text-red-500 hover:text-red-600 dark:text-red-400 dark:hover:text-red-300 p-1.5 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-full transition-colors self-start border border-transparent hover:border-red-100 dark:hover:border-red-800/50"
                                      title="Xóa từ này"
                                    >
                                      <Trash2 size={16} />
                                    </button>
                                  </div>
                                </div>

                                {/* 1 Ví dụ duy nhất */}
                                {examples.length > 0 && (() => {
                                  const ex = examples[0];
                                  const exContent = ex.content || ex.e;
                                  return (
                                    <div className="bg-indigo-50/50 dark:bg-indigo-900/20 p-3 rounded-xl border border-indigo-100 dark:border-indigo-800/50 transition-colors">
                                      <span className="text-[10px] font-bold text-indigo-500 dark:text-indigo-400 uppercase tracking-widest block mb-0.5">Ví dụ:</span>
                                      <div className="text-gray-800 dark:text-gray-200 font-medium text-sm flex items-start gap-1.5 transition-colors">
                                        <span className="text-indigo-400 dark:text-indigo-500 select-none">•</span>
                                        <span>{exContent}</span>
                                      </div>
                                    </div>
                                  );
                                })()}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()}

              </>
            )}
          </div>
        )}

      </main>
    </div>
  );
}

// =========================================================================
// COMPONENT THẺ TỪ VỰNG
// =========================================================================
function WordCard({ item, savedWords, onSave, onPlay, onSearchWord }) {
  // Lấy định nghĩa đầu tiên làm chính
  const firstContent = item.content?.[0];
  const firstMean = firstContent?.means?.[0];

  // Tách từ ghép (compound) thành mảng từ khóa để bấm
  const compounds = item.compound ? item.compound.split(';').map(c => c.trim()).filter(c => c) : [];

  return (
    <div className="bg-white dark:bg-gray-800 p-6 sm:p-8 rounded-3xl shadow-lg border border-gray-100 dark:border-gray-700 hover:shadow-xl hover:-translate-y-1 transition-all duration-300">

      {/* Header Thẻ: Chữ Hán, Pinyin, Nút */}
      <div className="flex justify-between items-start mb-4">
        <div>
          <div className="flex items-end gap-3 mb-1">
            <h2 className="text-4xl font-bold text-gray-900 dark:text-gray-100 transition-colors">{item.word}</h2>
            <button
              onClick={onPlay}
              className="text-indigo-500 dark:text-indigo-400 mb-1 p-2 bg-indigo-50 dark:bg-indigo-900/30 rounded-full hover:bg-indigo-100 dark:hover:bg-indigo-900/50 transition-colors"
              title="Nghe phát âm"
            >
              <Volume2 size={20} />
            </button>
          </div>
          <div className="text-lg font-medium text-indigo-600 dark:text-indigo-400 tracking-wide transition-colors">
            [{item.pinyin || item.zhuyin}]
          </div>
        </div>

        {/* Remove global save button since we save per meaning now */}
      </div>

      {/* Hán Việt */}
      <div className="mb-4 pb-4 border-b border-gray-100 dark:border-gray-700 transition-colors">
        <span className="text-gray-500 dark:text-gray-400 text-sm font-medium uppercase tracking-wider transition-colors">Hán Việt</span>
        <div className="text-xl font-medium text-gray-800 dark:text-gray-100 capitalize mt-1 transition-colors">{item.cn_vi}</div>
      </div>

      {/* Định nghĩa & Ví dụ */}
      <div className="space-y-4 mb-6">
        {item.content?.map((contentBlock, idx) => (
          <div key={idx} className="bg-gray-50 dark:bg-gray-900/40 rounded-2xl p-5 border border-gray-100 dark:border-gray-800 transition-colors">
            {contentBlock.kind && (
              <div className="mb-4">
                <span className="inline-block px-3 py-1 bg-indigo-100 dark:bg-indigo-900/40 text-indigo-800 dark:text-indigo-300 text-sm font-bold rounded-lg border border-indigo-200 dark:border-indigo-800/50 shadow-sm transition-colors">
                  Từ loại: {contentBlock.kind}
                </span>
              </div>
            )}

            {contentBlock.means?.map((meanObj, mIdx) => {
              const meaningId = `${item.id}_${idx}_${mIdx}`;
              const isMeaningSaved = savedWords.some(w => w.id === meaningId);

              return (
                <div key={mIdx} className="mb-5 last:mb-0 bg-white dark:bg-gray-800 p-4 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 transition-colors relative group">
                  <div className="flex justify-between items-start gap-4">
                    <div className="font-semibold text-lg text-gray-900 dark:text-gray-100 flex items-start gap-2 mb-2 transition-colors flex-1">
                      <span className="text-indigo-500 dark:text-indigo-400 mt-1.5 transition-colors">•</span>
                      <span>{meanObj.mean || meanObj.explain}</span>
                    </div>

                    {/* Nút Save riêng cho từng Nghĩa */}
                    <button
                      onClick={() => onSave(item, contentBlock, meanObj, idx, mIdx)}
                      disabled={isMeaningSaved}
                      className={`flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${isMeaningSaved
                        ? 'bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400 border border-green-200 dark:border-green-800/50 cursor-default shadow-sm'
                        : 'bg-white dark:bg-gray-800 border border-indigo-100 dark:border-indigo-800/50 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 shadow-sm hover:shadow'
                        }`}
                    >
                      {isMeaningSaved ? <><Check size={16} /> Đã lưu</> : <><Plus size={16} /> Lưu nghĩa này</>}
                    </button>
                  </div>

                  {/* Lời giải thích tiếng Trung (nếu có) */}
                  {meanObj.explain && meanObj.mean !== meanObj.explain && (
                    <div className="ml-6 mt-2 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg text-gray-700 dark:text-gray-300 text-sm border-l-4 border-gray-400 dark:border-gray-600 transition-colors">
                      <span className="font-semibold text-gray-800 dark:text-gray-200 block mb-1 transition-colors">Giải thích (Tiếng Trung):</span>
                      {meanObj.explain}
                    </div>
                  )}

                  {/* Danh sách ví dụ */}
                  {meanObj.examples?.length > 0 && (
                    <div className="mt-4 ml-6 space-y-3 border-l-2 border-indigo-200 dark:border-indigo-800/50 pl-4 transition-colors">
                      <div className="text-sm font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2 transition-colors">Ví dụ:</div>
                      {meanObj.examples.map((ex, exIdx) => {
                        const exContent = ex.content || ex.e;
                        const exPinyin = ex.pinyin || ex.p;
                        const exMean = ex.mean || ex.m;

                        return (
                          <div key={exIdx} className="text-sm pb-3 border-b border-gray-50 dark:border-gray-700 last:border-0 last:pb-0 transition-colors">
                            <div className="text-gray-900 dark:text-gray-100 font-medium text-base mb-1 transition-colors">{exContent}</div>
                            {exPinyin && <div className="text-gray-500 dark:text-gray-400 mb-1 font-mono text-xs transition-colors">{exPinyin}</div>}
                            <div className="text-teal-800 dark:text-teal-300 italic border-l-2 border-teal-300 dark:border-teal-700/50 pl-3 bg-teal-50/50 dark:bg-teal-900/20 py-1.5 px-2 rounded-r transition-colors">
                              {exMean}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}

            {/* Mục Ngữ pháp (Structs) */}
            {contentBlock.structs?.length > 0 && (
              <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700 transition-colors">
                <h4 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2 transition-colors">
                  <BookMarked size={16} className="text-indigo-500 dark:text-indigo-400" />
                  Cấu trúc / Cách dùng
                </h4>
                <div className="space-y-4">
                  {contentBlock.structs.map((st, stIdx) => (
                    <div key={stIdx} className="bg-orange-50/50 dark:bg-orange-900/10 p-4 rounded-xl border border-orange-100 dark:border-orange-900/30 transition-colors">

                      {/* Cấu trúc & Giải thích */}
                      <div className="mb-3">
                        {st.struct && (
                          <div className="text-orange-800 dark:text-orange-300 font-bold bg-orange-100 dark:bg-orange-900/30 inline-block px-3 py-1.5 rounded-lg border border-orange-200 dark:border-orange-800/50 shadow-sm mb-2 transition-colors">
                            {st.struct}
                          </div>
                        )}
                        {st.explain && (
                          <div className="text-gray-700 dark:text-gray-300 font-medium transition-colors">
                            <span className="text-gray-500 dark:text-gray-400 mr-2 transition-colors">Ý nghĩa:</span>{st.explain}
                          </div>
                        )}
                      </div>

                      {/* Ví dụ của cấu trúc */}
                      {st.examples?.length > 0 && (
                        <div className="space-y-3 mt-3 ml-2 border-l-2 border-orange-200 dark:border-orange-800/50 pl-4 transition-colors">
                          {st.examples.map((ex, exIdx) => {
                            const exContent = ex.content || ex.e;
                            const exPinyin = ex.pinyin || ex.p;
                            const exMean = ex.mean || ex.m;

                            return (
                              <div key={exIdx} className="text-sm pb-2 border-b border-orange-100/50 dark:border-orange-900/30 last:border-0 last:pb-0 transition-colors">
                                <div className="text-gray-900 dark:text-gray-100 font-medium mb-1 transition-colors">{exContent}</div>
                                {exPinyin && <div className="text-gray-500 dark:text-gray-400 mb-1 font-mono text-xs transition-colors">{exPinyin}</div>}
                                <div className="text-orange-900 dark:text-orange-200 italic transition-colors">
                                  {exMean}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        ))}
      </div>

      {/* TỪ GHÉP / ĐỀ XUẤT */}
      {compounds.length > 0 && (
        <div className="pt-4 border-t-dashed border-gray-200 dark:border-gray-700 mt-6 mb-6 transition-colors">
          <h4 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-3 transition-colors">Từ Ghép Thường Gặp</h4>
          <div className="flex flex-wrap gap-2">
            {compounds.map((c, i) => (
              <button
                key={i}
                onClick={() => onSearchWord && onSearchWord(c)}
                className="px-3 py-1.5 bg-gray-50 dark:bg-gray-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/40 text-gray-700 dark:text-gray-300 hover:text-indigo-700 dark:hover:text-indigo-300 font-medium border border-gray-200 dark:border-gray-700 hover:border-indigo-200 dark:hover:border-indigo-700 rounded-lg transition-colors text-sm shadow-sm"
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* PHÂN BIỆT TỪ (COMPARE) */}
      {item.compare && item.compare.length > 0 && (
        <div className="pt-4 border-t-2 border-purple-100 dark:border-purple-900/30 transition-colors">
          <h4 className="text-sm font-bold text-purple-600 dark:text-purple-400 uppercase tracking-wider mb-4 flex items-center gap-2 transition-colors">
            Phân biệt từ vựng
          </h4>
          <div className="space-y-4">
            {item.compare.map((cmp, cmpIdx) => (
              <div key={cmpIdx} className="bg-purple-50 dark:bg-purple-900/10 p-4 rounded-xl border border-purple-100 dark:border-purple-900/30 transition-colors">
                <div className="font-bold text-purple-900 dark:text-purple-200 mb-2 text-lg transition-colors">
                  {cmp.title}
                </div>
                {cmp.words && cmp.words.length > 0 && (
                  <div className="flex gap-2 mb-3">
                    {cmp.words.map((w, wIdx) => (
                      <button
                        key={wIdx}
                        onClick={() => onSearchWord && onSearchWord(w)}
                        className="px-2 py-1 bg-white dark:bg-gray-800 hover:bg-purple-100 dark:hover:bg-purple-900/40 text-purple-700 dark:text-purple-300 font-medium rounded-md border border-purple-200 dark:border-purple-800/50 hover:border-purple-300 dark:hover:border-purple-700 shadow-sm text-sm transition-colors cursor-pointer"
                      >
                        {w}
                      </button>
                    ))}
                  </div>
                )}
                {cmp.mean_vi && (
                  <div className="text-gray-700 dark:text-gray-300 text-sm whitespace-pre-wrap leading-relaxed transition-colors">
                    {cmp.mean_vi}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}

// =========================================================================
// COMPONENT MÀN HÌNH ĐĂNG NHẬP
// =========================================================================
function LoginScreen() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email || !password) return setError("Vui lòng nhập Email và Mật khẩu!");

    setIsLoading(true);
    setError('');

    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err) {
      console.error(err);
      setError("Sai thông tin đăng nhập hoặc tài khoản không tồn tại!");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gray-50 dark:bg-gray-900 relative overflow-hidden transition-colors duration-300">
      {/* Background Decor */}
      <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-indigo-200 dark:bg-indigo-900/30 rounded-full mix-blend-multiply filter blur-3xl opacity-70 transition-colors"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-96 h-96 bg-blue-200 dark:bg-blue-900/30 rounded-full mix-blend-multiply filter blur-3xl opacity-70 transition-colors"></div>

      <div className="relative bg-white dark:bg-gray-800 w-full max-w-md p-8 rounded-3xl shadow-xl border border-gray-100 dark:border-gray-700 z-10 transition-colors">
        <div className="text-center mb-8">
          <div className="bg-indigo-50 dark:bg-indigo-900/40 w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-5 text-indigo-600 dark:text-indigo-400 shadow-inner border border-indigo-100 dark:border-indigo-800 mt-2 rotate-3 hover:rotate-6 transition-all">
            <BookMarked size={40} className="-rotate-3" />
          </div>
          <h2 className="text-3xl font-black text-gray-900 dark:text-gray-100 tracking-tight transition-colors">Từ Điển Của Tôi</h2>
          <p className="text-gray-500 dark:text-gray-400 font-medium text-sm mt-3 px-4 transition-colors">Đăng nhập để đồng bộ thẻ từ vựng an toàn qua Cloud Database.</p>
        </div>

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 p-3 rounded-xl text-sm font-semibold mb-6 flex justify-center text-center border border-red-100 dark:border-red-800 transition-colors">
            {error}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-5">
          <div>
            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1.5 ml-1 transition-colors">Tài khoản Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3.5 rounded-xl border-2 border-gray-100 dark:border-gray-700 focus:outline-none focus:ring-4 focus:ring-indigo-50 dark:focus:ring-indigo-900/50 focus:border-indigo-500 dark:focus:border-indigo-500 transition-all font-medium text-gray-800 dark:text-gray-100 bg-gray-50/50 dark:bg-gray-800/50"
              placeholder="nhapemail@domain.com"
            />
          </div>

          <div>
            <label className="block text-sm font-bold text-gray-700 dark:text-gray-300 mb-1.5 ml-1 transition-colors">Mật khẩu</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-3.5 rounded-xl border-2 border-gray-100 dark:border-gray-700 focus:outline-none focus:ring-4 focus:ring-indigo-50 dark:focus:ring-indigo-900/50 focus:border-indigo-500 dark:focus:border-indigo-500 transition-all font-medium text-gray-800 dark:text-gray-100 bg-gray-50/50 dark:bg-gray-800/50"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={isLoading}
            className="w-full bg-indigo-600 text-white font-bold text-lg py-4 mt-2 rounded-xl hover:bg-indigo-700 active:bg-indigo-800 transition-colors shadow-lg shadow-indigo-600/20 dark:shadow-indigo-900/40 disabled:opacity-70 flex justify-center items-center"
          >
            {isLoading ? <div className="animate-spin rounded-full h-6 w-6 border-2 border-white border-t-transparent"></div> : "Đăng Nhập Sổ Tay"}
          </button>
        </form>

      </div>
    </div>
  );
}

// =========================================================================
// COMPONENT ÔN TẬP TỪ VỰNG (REVIEW SCREEN)
// =========================================================================
function ReviewScreen({ savedWords, updateRating, playAudio, setActiveTab }) {
  const [hasStarted, setHasStarted] = useState(false);
  const [queue, setQueue] = useState([]);
  const [currentQuestion, setCurrentQuestion] = useState(null);
  const [options, setOptions] = useState([]);
  const [mistakes, setMistakes] = useState({});
  const [isFinished, setIsFinished] = useState(false);
  const [feedback, setFeedback] = useState(null); // 'correct' | 'wrong'
  const [showResult, setShowResult] = useState(false);
  const [totalReviewed, setTotalReviewed] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  // Lưu nháp kết quả tăng/giảm sao chưa bắn lên server: { wordId: newRating }
  const [pendingUpdates, setPendingUpdates] = useState({});
  const [isSavingOnExit, setIsSavingOnExit] = useState(false);

  // State for Review Summary
  const [sessionResults, setSessionResults] = useState([]); // Array of { wordObj, isCorrect }

  // Initialize queue on mount
  useEffect(() => {

    const reviewable = savedWords.filter(w => w.rating < 5);
    if (reviewable.length === 0) {
      setIsFinished(true);
      return;
    }

    // Sort: low rating first, then random
    const shuffled = [...reviewable].sort((a, b) => {
      if (a.rating !== b.rating) return a.rating - b.rating;
      return Math.random() - 0.5;
    });

    setQueue(shuffled);
  }, [savedWords]); // Re-init if library updates drastically

  // Generate question
  useEffect(() => {
    try {
      if (queue.length > 0 && !currentQuestion && !showResult) {
        generateQuestion(queue[0]);
      } else if (queue.length === 0 && totalReviewed > 0) {
        setIsFinished(true);
      }
    } catch (e) {
      console.error("Lỗi trong quá trình chuẩn bị câu hỏi:", e);
    }
  }, [queue, currentQuestion, showResult]);

  // Random 1 từ trong danh sách savedWords
  const generateQuestion = (word) => {
    try {
      console.log("Đang tạo câu hỏi cho từ:", word);
      let availableTypes = [1, 2]; // 1: Listen, 2: Meaning (Vi)

      // Đã gỡ bỏ Question Type 3 (Giải nghĩa bề mặt Hán - Hán) theo yêu cầu User

      // Check if examples exist
      const hasExample = word.isSpecificMeaning ? word.examples?.length > 0 : word.content?.[0]?.means?.[0]?.examples?.length > 0;
      if (hasExample) availableTypes.push(0); // 0: Fill blank

      const type = availableTypes[Math.floor(Math.random() * availableTypes.length)];
      let baseQuestion = { wordObj: word, type };

      const distractorWords = savedWords.filter(w => w.id !== word.id).sort(() => 0.5 - Math.random()).slice(0, 3);
      let finalOptions = [word, ...distractorWords].sort(() => 0.5 - Math.random());

      if (type === 0) {
        // Safe check for examples
        const examples = word.isSpecificMeaning ? word.examples : word.content?.[0]?.means?.[0]?.examples;
        if (examples && examples.length > 0) {
          const ex = examples[Math.floor(Math.random() * examples.length)];
          const exContent = ex.content || ex.e || "";

          if (exContent) {
            // Sanitize word for regex
            const safeWord = word.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(safeWord, "g");
            baseQuestion.maskedEx = exContent.replace(regex, "___");
            baseQuestion.exMean = ex.mean || ex.m || "Không có giải nghĩa ví dụ";
          } else {
            // Fallback if example content is somehow missing
            baseQuestion.maskedEx = "___";
            baseQuestion.exMean = "Không có giải nghĩa ví dụ";
          }
        } else {
          // Should not happen since we check hasExample above, but just in case
          baseQuestion.maskedEx = "___";
          baseQuestion.exMean = "Không có giải nghĩa ví dụ";
        }
      }

      setOptions(finalOptions);
      setCurrentQuestion(baseQuestion);

      if (type === 1 || type === 2) {
        if (hasStarted) {
          setTimeout(() => playAudio(word.word), 300);
        }
      }
    } catch (err) {
      console.error("Lỗi khi generateQuestion:", err);
      // Fallback skip question
      setQueue(prev => prev.slice(1));
    }
  };

  // Kích hoạt loa đọc lại câu 1 nếu lúc auto-generate chưa đc allow play vì !hasStarted
  useEffect(() => {
    if (hasStarted && currentQuestion && (currentQuestion.type === 1 || currentQuestion.type === 2)) {
      setTimeout(() => playAudio(currentQuestion.wordObj.word), 300);
    }
  }, [hasStarted]);

  // Hàm Push đồng loạt các State thay đổi lên Firestore
  const saveAndExit = async () => {
    setIsSavingOnExit(true);
    try {
      const promises = Object.entries(pendingUpdates).map(([wordId, newRating]) => {
        return updateRating(wordId, newRating);
      });
      await Promise.all(promises);
      console.log(`Đã lưu ${promises.length} thay đổi sao lên Firebase!`);
    } catch (e) {
      console.error("Lỗi khi lưu đồng loạt:", e);
    } finally {
      setIsSavingOnExit(false);
      setActiveTab('saved'); // Thoát
    }
  };

  const handleNextQuestion = () => {
    if (!currentQuestion) return;

    const isCorrect = feedback === 'correct';

    if (isCorrect) {
      setTotalReviewed(prev => prev + 1);

      // Track for summary if not already tracked
      if (!sessionResults.some(res => res.wordObj.id === currentQuestion.wordObj.id)) {
        setSessionResults(prev => [...prev, { wordObj: currentQuestion.wordObj, isCorrect: true }]);
      }

      setQueue(prev => prev.slice(1));
    } else {
      // Track as wrong for summary if not already tracked
      if (!sessionResults.some(res => res.wordObj.id === currentQuestion.wordObj.id)) {
        setSessionResults(prev => [...prev, { wordObj: currentQuestion.wordObj, isCorrect: false }]);
      }

      setQueue(prev => {
        const newQueue = [...prev];
        if (newQueue.length > 0) {
          const failedWord = newQueue.shift();
          const insertIdx = Math.min(2, newQueue.length);
          newQueue.splice(insertIdx, 0, failedWord);
        }
        return newQueue;
      });
    }

    setCurrentQuestion(null);
    setShowResult(false);
    setFeedback(null);
    setIsPaused(false);
  };

  // Timer điều khiển auto-next
  useEffect(() => {
    let timer;
    if (showResult && !isPaused) {
      timer = setTimeout(() => {
        handleNextQuestion();
      }, 3000); // 3s delay
    }
    return () => clearTimeout(timer);
  }, [showResult, isPaused, feedback, currentQuestion]);

  const handleAnswer = async (selectedOption) => {
    if (showResult) return;

    const isCorrect = selectedOption.id === currentQuestion.wordObj.id;
    const wordId = currentQuestion.wordObj.id;

    if (isCorrect) {
      setFeedback('correct');
      setShowResult(true);
      playAudio(currentQuestion.wordObj.word); // Phát âm ngay lập tức

      if (!mistakes[wordId] && currentQuestion.wordObj.rating < 5) {
        // Cache update
        setPendingUpdates(prev => {
          let currentBaseRating = prev[wordId] !== undefined ? prev[wordId] : currentQuestion.wordObj.rating;
          return { ...prev, [wordId]: Math.min(5, currentBaseRating + 1) };
        });
      }
    } else {
      setFeedback('wrong');
      const currentMistakes = (mistakes[wordId] || 0) + 1;
      setMistakes(prev => ({ ...prev, [wordId]: currentMistakes }));

      if (currentMistakes === 3) {
        // Cache trừng phạt (chỉ lùi sao nếu sai 3 lần nhưng giao diện vẫn hiện đáp án liền)
        setPendingUpdates(prev => {
          let currentBaseRating = prev[wordId] !== undefined ? prev[wordId] : currentQuestion.wordObj.rating;
          return { ...prev, [wordId]: Math.max(1, currentBaseRating - 1) };
        });
      }

      setShowResult(true);
      playAudio(currentQuestion.wordObj.word); // Phát âm ngay lập tức
    }
  };

  if (!hasStarted) {
    const reviewableCount = savedWords.filter(w => w.rating < 5).length;
    return (
      <div className="bg-white dark:bg-gray-800 p-10 rounded-3xl shadow-md text-center max-w-lg mx-auto mt-10 border border-gray-100 dark:border-gray-700 relative overflow-hidden transition-colors duration-300">
        <div className="absolute top-[-20%] left-[-10%] w-64 h-64 bg-indigo-100 dark:bg-indigo-900/30 rounded-full mix-blend-multiply filter blur-3xl opacity-50 transition-colors"></div>
        <div className="w-24 h-24 bg-indigo-50 dark:bg-indigo-900/40 rounded-3xl flex items-center justify-center mx-auto mb-6 text-indigo-600 dark:text-indigo-400 rotate-3 shadow-inner border border-indigo-100 dark:border-indigo-800 transition-all">
          <Gamepad2 size={48} className="-rotate-3" />
        </div>
        <h2 className="text-3xl font-black text-gray-900 dark:text-gray-100 mb-2 transition-colors">Phòng Tập Gym</h2>
        <p className="text-gray-500 dark:text-gray-400 mb-8 font-medium transition-colors">Bạn có <strong className="text-indigo-600 dark:text-indigo-400">{reviewableCount}</strong> từ vựng cần được rèn luyện bộ nhớ.</p>
        <button
          onClick={() => setHasStarted(true)}
          disabled={reviewableCount === 0}
          className="w-full bg-indigo-600 text-white font-bold text-lg px-6 py-4 rounded-xl hover:bg-indigo-700 active:bg-indigo-800 transition-colors shadow-lg shadow-indigo-600/20 disabled:opacity-50 disabled:bg-gray-400 dark:disabled:bg-gray-600 disabled:shadow-none"
        >
          {reviewableCount === 0 ? "Bạn đã thuộc hết mọi từ vựng!" : "Bắt Đầu Giải Đố"}
        </button>
      </div>
    );
  }

  if (isFinished) {
    const correctCount = sessionResults.filter(r => r.isCorrect).length;
    const totalCount = sessionResults.length;

    return (
      <div className="bg-white dark:bg-gray-800 p-8 rounded-3xl shadow-lg text-center max-w-2xl mx-auto mt-10 border border-gray-100 dark:border-gray-700 transition-colors duration-300">
        <div className="w-24 h-24 bg-green-100 dark:bg-green-900/30 rounded-full flex items-center justify-center mx-auto mb-6 text-green-600 dark:text-green-400">
          <Check size={48} />
        </div>
        <h2 className="text-3xl font-black text-gray-900 dark:text-gray-100 mb-2 transition-colors">Tuyệt Vời!</h2>
        <p className="text-gray-600 dark:text-gray-400 mb-8 font-medium transition-colors">
          Báo cáo tiến độ ôn tập của bạn: <strong className="text-indigo-600 dark:text-indigo-400">{correctCount}/{totalCount}</strong> từ trả lời đúng.
        </p>

        {/* Danh sách từ vựng đã ôn */}
        {totalCount > 0 && (
          <div className="text-left bg-gray-50 dark:bg-gray-900/50 rounded-2xl p-4 mb-8 border border-gray-100 dark:border-gray-700 max-h-60 overflow-y-auto custom-scrollbar">
            <h3 className="text-sm font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-3 px-2">Chi tiết phiên ôn tập</h3>
            <div className="space-y-2">
              {sessionResults.map((res, idx) => {
                const wObj = res.wordObj;
                const meaningDisplay = wObj.isSpecificMeaning
                  ? wObj.meaning
                  : (wObj.content?.[0] ? wObj.content[0].means[0].mean || wObj.content[0].means[0].explain : wObj.cn_vi);

                return (
                  <div key={idx} className={`p-3 rounded-xl flex items-center justify-between border ${res.isCorrect ? 'bg-green-50/50 dark:bg-green-900/10 border-green-100 dark:border-green-900/30' : 'bg-red-50/50 dark:bg-red-900/10 border-red-100 dark:border-red-900/30'} transition-colors`}>
                    <div className="flex items-center gap-3">
                      <div className={`flex items-center justify-center w-8 h-8 rounded-full ${res.isCorrect ? 'bg-green-100 dark:bg-green-900/40 text-green-600 dark:text-green-400' : 'bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400'}`}>
                        {res.isCorrect ? <Check size={16} /> : <span className="font-bold cursor-default select-none">✕</span>}
                      </div>
                      <div>
                        <div className="font-bold text-gray-900 dark:text-gray-100">{wObj.word} <span className="font-normal text-sm text-gray-500 dark:text-gray-400 ml-1">[{wObj.pinyin || wObj.zhuyin}]</span></div>
                        <div className="text-sm text-gray-600 dark:text-gray-300 truncate max-w-[200px] sm:max-w-xs">{meaningDisplay}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <button
          onClick={saveAndExit}
          disabled={isSavingOnExit}
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-lg px-8 py-3.5 rounded-xl transition-all shadow-lg hover:-translate-y-0.5 disabled:opacity-70 flex items-center justify-center mx-auto gap-2"
        >
          {isSavingOnExit ? (
            <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
          ) : (
            <>
              <LibraryBig size={20} />
              Trở Về Sổ Tay
            </>
          )}
        </button>
      </div>
    );
  }

  if (!currentQuestion) {
    return <div className="text-center py-20 text-gray-500 font-medium">Đang chuẩn bị thẻ bài...</div>;
  }

  const { wordObj, type, maskedEx, exMean } = currentQuestion;
  const currentTempRating = pendingUpdates[wordObj.id] !== undefined ? pendingUpdates[wordObj.id] : wordObj.rating;

  return (
    <div className="max-w-2xl mx-auto mt-2">
      <div className="mb-2 flex justify-between items-center px-2">
        <button
          onClick={() => setIsFinished(true)}
          disabled={isSavingOnExit}
          title="Kết thúc sớm & Xem báo cáo"
          className="bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 hover:bg-red-100 dark:hover:bg-red-900/40 hover:text-red-500 dark:hover:text-red-400 px-4 py-2 rounded-xl flex items-center gap-2 transition-colors border border-transparent dark:border-gray-700 shadow-sm cursor-pointer font-bold font-sm"
        >
          <LogOut size={18} />
          {isSavingOnExit ? "Đang lưu..." : "Thoát ôn tập"}
        </button>
      </div>

      <div className={`bg-white dark:bg-gray-800 p-4 sm:p-6 rounded-3xl shadow-lg border-2 transition-all duration-300 mb-4 ${feedback === 'correct' ? 'border-green-400 bg-green-50 dark:bg-green-900/20 dark:border-green-500/50' : feedback === 'wrong' ? 'border-red-400 bg-red-50 dark:bg-red-900/20 dark:border-red-500/50 relative' : 'border-gray-100 dark:border-gray-700'}`}
        style={feedback === 'wrong' ? { animation: 'shake 0.5s cubic-bezier(.36,.07,.19,.97) both' } : {}}>

        <div className="text-center mb-4 min-h-[100px] flex flex-col justify-center items-center">

          {type === 0 && (
            <div className="w-full">
              <div className="text-xs font-bold text-blue-500 dark:text-blue-400 uppercase tracking-wider mb-6 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/50 py-1.5 px-3 rounded-full inline-block transition-colors">Điền từ vào chỗ trống</div>
              <p className="text-2xl font-medium text-gray-800 dark:text-gray-100 mb-4 leading-relaxed transition-colors">{maskedEx}</p>
              {showResult && <p className="text-gray-500 dark:text-gray-400 italic text-sm animate-fade-in transition-colors">{exMean}</p>}
            </div>
          )}

          {type === 1 && (
            <div>
              <div className="text-xs font-bold text-purple-500 dark:text-purple-400 uppercase tracking-wider mb-6 bg-purple-50 dark:bg-purple-900/20 border border-purple-100 dark:border-purple-800/50 py-1.5 px-3 rounded-full inline-block transition-colors">Nghe và chọn Hán tự</div>
              <button onClick={() => playAudio(wordObj.word)} className="bg-purple-100 dark:bg-purple-900/40 w-24 h-24 rounded-full flex items-center justify-center text-purple-600 dark:text-purple-400 border border-purple-200 dark:border-purple-800/50 hover:bg-purple-200 dark:hover:bg-purple-900/60 transition-colors shadow-inner mx-auto group">
                <Volume2 size={40} className="group-hover:scale-110 transition-transform" />
              </button>
            </div>
          )}

          {type === 2 && (
            <div>
              <div className="text-xs font-bold text-orange-500 dark:text-orange-400 uppercase tracking-wider mb-4 bg-orange-50 dark:bg-orange-900/20 border border-orange-100 dark:border-orange-800/50 py-1.5 px-3 rounded-full inline-block transition-colors">
                Dịch nghĩa Tiếng Việt
              </div>
              <h2 className="text-5xl md:text-6xl font-black text-gray-900 dark:text-gray-100 mb-4 drop-shadow-sm transition-colors">{wordObj.word}</h2>
              <button onClick={() => playAudio(wordObj.word)} className="text-gray-400 dark:text-gray-500 hover:text-orange-500 dark:hover:text-orange-400 flex items-center gap-1.5 mx-auto text-sm font-medium bg-gray-50 dark:bg-gray-900/50 px-3 py-1.5 rounded-lg border border-gray-100 dark:border-gray-800 transition-colors">
                <Volume2 size={16} /> Nghe lại
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {options.map((opt, idx) => {
            let optContent = "";
            let optSubContent = null;

            if (type === 0 || type === 1) {
              optContent = opt.word;
              // Ẩn Pinyin luôn, chỉ để chữ Hán cho User khó đoán
              optSubContent = null;
            } else if (type === 2) {
              optContent = opt.isSpecificMeaning ? opt.meaning : (opt.content?.[0]?.means?.[0]?.mean || opt.cn_vi || "Chưa có nghĩa");
              optSubContent = null;
            }

            let btnClass = "bg-white dark:bg-gray-800 hover:bg-indigo-50 dark:hover:bg-gray-700/80 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-indigo-300 dark:hover:border-indigo-500/50 hover:shadow-md transition-all";
            if (showResult) {
              if (opt.id === wordObj.id) {
                btnClass = "bg-green-500 dark:bg-green-600 border-green-600 dark:border-green-500 text-white shadow-lg scale-[1.03] z-10";
              } else {
                btnClass = "bg-gray-50 dark:bg-gray-900/50 border-gray-100 dark:border-gray-800 text-gray-300 dark:text-gray-600 opacity-50 scale-95";
              }
            }

            return (
              <button
                key={idx}
                disabled={showResult}
                onClick={() => handleAnswer(opt)}
                className={`p-3 rounded-2xl border-2 text-left transition-all duration-300 ${btnClass} flex flex-col justify-center min-h-[70px] sm:min-h-[80px]`}
              >
                <div className={`font-bold leading-tight ${type === 2 ? 'text-[15px] sm:text-base line-clamp-3' : 'text-xl sm:text-2xl mb-1'} ${(showResult && opt.id !== wordObj.id) ? 'text-gray-400 dark:text-gray-600' : ''}`}>{optContent}</div>
                {optSubContent && <div className={`text-xs ${showResult && opt.id === wordObj.id ? 'text-green-100 dark:text-green-200' : 'text-gray-500 dark:text-gray-400 font-mono'}`}>{optSubContent}</div>}
              </button>
            )
          })}
        </div>

        {/* CHI TIẾT ĐÁP ÁN (Chỉ hiển thị khi có kết quả) */}
        {showResult && (() => {
          const reviewWordKind = wordObj.isSpecificMeaning ? wordObj.kind : wordObj.content?.[0]?.kind;
          const reviewExplainText = wordObj.isSpecificMeaning ? wordObj.explain : wordObj.content?.[0]?.means?.[0]?.explain;
          const reviewMainMeaning = wordObj.isSpecificMeaning
            ? wordObj.meaning
            : (wordObj.content?.[0] ? wordObj.content[0].means[0].mean || wordObj.content[0].means[0].explain : "Không có định nghĩa");
          const showReviewExplain = reviewExplainText && reviewExplainText !== reviewMainMeaning;

          return (
            <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-800 animate-fade-in text-left transition-colors">
              <h3 className="text-xs font-bold text-gray-400 dark:text-gray-500 uppercase tracking-widest mb-2 transition-colors">Chi tiết đáp án</h3>
              <div className="bg-gray-50 dark:bg-gray-900/40 border border-gray-200 dark:border-gray-800 rounded-2xl p-4 mb-4 transition-colors">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-3xl font-bold text-gray-900 dark:text-gray-100 transition-colors">{wordObj.word}</span>
                  <span className="text-lg font-medium text-indigo-600 dark:text-indigo-400 transition-colors">
                    [{wordObj.pinyin || wordObj.zhuyin}] {reviewWordKind ? `(${reviewWordKind})` : ''}
                  </span>
                  <button onClick={() => playAudio(wordObj.word)} className="ml-2 text-gray-400 dark:text-gray-500 hover:text-indigo-500 dark:hover:text-indigo-400 transition-colors border border-gray-200 dark:border-gray-700 rounded-full p-1.5 bg-white dark:bg-gray-800 shadow-sm"><Volume2 size={16} /></button>
                </div>

                <div className="font-semibold text-lg text-gray-900 dark:text-gray-100 transition-colors">
                  {reviewMainMeaning}
                </div>

                {/* Only show explain if explain is different from meaning */}
                {showReviewExplain && (
                  <div className="mt-2 p-2.5 bg-white dark:bg-gray-800 rounded-lg text-gray-700 dark:text-gray-400 text-sm border-l-2 border-gray-300 dark:border-gray-600 transition-colors">
                    {reviewExplainText}
                  </div>
                )}

                {/* Example */}
                {(wordObj.isSpecificMeaning ? wordObj.examples : wordObj.content?.[0]?.means?.[0]?.examples)?.length > 0 && (() => {
                  const examplesList = wordObj.isSpecificMeaning ? wordObj.examples : wordObj.content[0].means[0].examples;
                  // Use a seeded or consistent random based on the wordObj.id to prevent flickering during re-renders
                  // We'll just pick a random one inline for now, but in reality a purely random string might change if react re-renders. 
                  // Since this is inside a mapped/static list of options we want to just pick one safely.
                  const randomExIndex = Math.floor(Math.random() * examplesList.length);
                  const ex = examplesList[randomExIndex];

                  return (
                    <div className="bg-white dark:bg-gray-800 p-3 rounded-xl border border-blue-100 dark:border-blue-900/30 mt-2 transition-colors">
                      <div className="flex gap-2 text-gray-700 dark:text-gray-300 transition-colors">
                        <span className="text-blue-500 dark:text-blue-400 mt-1 transition-colors">•</span>
                        <div>
                          <div className="font-medium text-[15px] leading-relaxed">
                            {ex.content || ex.e}
                          </div>
                          <div className="text-sm text-gray-500 dark:text-gray-400 italic mt-0.5 transition-colors">
                            {ex.mean || ex.m}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>

              {/* ĐIỀU KHIỂN PAUSE / RESUME */}
              <div className="flex items-center justify-between gap-4 bg-white dark:bg-gray-800 px-4 py-3 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700 mt-2 transition-colors">
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => setIsPaused(!isPaused)}
                    className={`flex items-center justify-center w-10 h-10 rounded-full transition-all shadow-sm ${isPaused ? 'bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 border border-orange-200 dark:border-orange-800/50 shadow-inner' : 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600 border border-transparent dark:border-gray-600'}`}
                    title={isPaused ? "Tiếp tục đếm ngược" : "Tạm dừng đếm ngược"}
                  >
                    {isPaused ? <Play size={18} className="ml-1" /> : <Pause size={18} />}
                  </button>
                  <div className="text-[13px] font-medium hidden sm:block">
                    {isPaused ? <span className="text-orange-600 dark:text-orange-400 animate-pulse">Đã tạm dừng bộ đếm</span> : null}
                  </div>
                </div>

                <button
                  onClick={handleNextQuestion}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-bold flex items-center gap-2 transition hover:shadow-lg hover:-translate-y-0.5"
                >
                  Câu tiếp <ChevronRight size={18} />
                </button>
              </div>
            </div>
          );
        })()}

      </div>

      <style dangerouslySetInnerHTML={{
        __html: `
        @keyframes shake {
          10%, 90% { transform: translate3d(-1px, 0, 0); }
          20%, 80% { transform: translate3d(2px, 0, 0); }
          30%, 50%, 70% { transform: translate3d(-4px, 0, 0); }
          40%, 60% { transform: translate3d(4px, 0, 0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-fade-in {
          animation: fadeIn 0.4s ease-out forwards;
        }
      `}} />
    </div>
  );
}
