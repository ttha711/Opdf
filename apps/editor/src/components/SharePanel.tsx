import React, { useState, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Share2, Copy, X, Clock, Globe, Eye, Edit3, Check } from "lucide-react";

type SharePermission = "view" | "comment" | "edit";
type ShareExpiry = "1h" | "24h" | "7d" | "never";

interface ShareLink {
  token: string;
  permission: SharePermission;
  expiresAt: string | null;
  createdAt: string;
}

const STORAGE_KEY = "block_office_shares";

function loadShares(): ShareLink[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveShares(shares: ShareLink[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(shares));
}

function generateToken(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 10)}`;
}

function getExpiryDate(expiry: ShareExpiry): string | null {
  if (expiry === "never") return null;
  const ms = { "1h": 3600000, "24h": 86400000, "7d": 604800000 }[expiry];
  return new Date(Date.now() + ms).toISOString();
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

export default function SharePanel({ isOpen, onClose }: Props) {
  const [shares, setShares] = useState<ShareLink[]>(loadShares);
  const [permission, setPermission] = useState<SharePermission>("view");
  const [expiry, setExpiry] = useState<ShareExpiry>("24h");
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);

  const handleGenerateLink = useCallback(() => {
    const token = generateToken();
    const newShare: ShareLink = {
      token,
      permission,
      expiresAt: getExpiryDate(expiry),
      createdAt: new Date().toISOString(),
    };
    const updated = [newShare, ...shares];
    setShares(updated);
    saveShares(updated);
    setGeneratedLink(`https://officehub.app/share/${token}`);
  }, [permission, expiry, shares]);

  const handleCopyLink = useCallback((token: string) => {
    const link = `https://officehub.app/share/${token}`;
    navigator.clipboard.writeText(link).then(() => {
      setCopiedToken(token);
      setTimeout(() => setCopiedToken(null), 2000);
    });
  }, []);

  const handleDeleteShare = useCallback((token: string) => {
    const updated = shares.filter((s) => s.token !== token);
    setShares(updated);
    saveShares(updated);
  }, [shares]);

  const handleCopyAll = useCallback(() => {
    if (generatedLink) {
      navigator.clipboard.writeText(generatedLink).then(() => {
        setCopiedToken("__all__");
        setTimeout(() => setCopiedToken(null), 2000);
      });
    }
  }, [generatedLink]);

  const permissionLabel = (p: SharePermission) => {
    return { view: "Xem", comment: "Bình luận", edit: "Chỉnh sửa" }[p];
  };

  const expiryLabel = (e: ShareExpiry) => {
    return { "1h": "1 giờ", "24h": "24 giờ", "7d": "7 ngày", never: "Không giới hạn" }[e];
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh] bg-slate-900/50 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.96 }}
            className="w-full max-w-md bg-white rounded-xl shadow-2xl border border-slate-200 overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Share2 className="w-4 h-4 text-indigo-600" />
                <h3 className="text-sm font-bold text-slate-800">Chia sẻ tài liệu</h3>
              </div>
              <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              {/* Permission Select */}
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">Quyền truy cập</label>
                <div className="flex gap-1 mt-1">
                  {(["view", "comment", "edit"] as SharePermission[]).map((p) => (
                    <button
                      key={p}
                      onClick={() => setPermission(p)}
                      className={`flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg cursor-pointer transition-colors ${
                        permission === p
                          ? "bg-indigo-100 text-indigo-700 border border-indigo-300"
                          : "bg-slate-50 text-slate-500 border border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      {p === "view" ? <Eye className="w-3 h-3" /> : p === "comment" ? <Edit3 className="w-3 h-3" /> : <Edit3 className="w-3 h-3" />}
                      {permissionLabel(p)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Expiry Select */}
              <div>
                <label className="text-[10px] font-bold text-slate-500 uppercase">Thời hạn</label>
                <div className="flex gap-1 mt-1">
                  {(["1h", "24h", "7d", "never"] as ShareExpiry[]).map((e) => (
                    <button
                      key={e}
                      onClick={() => setExpiry(e)}
                      className={`flex items-center gap-1 px-3 py-1.5 text-xs rounded-lg cursor-pointer transition-colors ${
                        expiry === e
                          ? "bg-indigo-100 text-indigo-700 border border-indigo-300"
                          : "bg-slate-50 text-slate-500 border border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      <Clock className="w-3 h-3" />
                      {expiryLabel(e)}
                    </button>
                  ))}
                </div>
              </div>

              {/* Generate Button */}
              <button
                onClick={handleGenerateLink}
                className="w-full py-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg cursor-pointer transition-colors"
              >
                <Globe className="w-3.5 h-3.5 inline mr-1.5" />
                Tạo liên kết chia sẻ
              </button>

              {/* Generated Link */}
              {generatedLink && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3">
                  <p className="text-[10px] font-bold text-emerald-700 mb-1.5">Liên kết đã tạo:</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-[11px] bg-white border border-emerald-200 rounded px-2 py-1.5 text-emerald-800 truncate">
                      {generatedLink}
                    </code>
                    <button
                      onClick={handleCopyAll}
                      className="p-1.5 bg-emerald-100 hover:bg-emerald-200 text-emerald-700 rounded cursor-pointer"
                    >
                      {copiedToken === "__all__" ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
              )}

              {/* Existing Shares */}
              {shares.length > 0 && (
                <div>
                  <label className="text-[10px] font-bold text-slate-500 uppercase">Liên kết đã tạo ({shares.length})</label>
                  <div className="space-y-1.5 mt-1 max-h-40 overflow-y-auto">
                    {shares.map((share) => (
                      <div key={share.token} className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-bold text-slate-600">
                              {permissionLabel(share.permission)}
                            </span>
                            {share.expiresAt && (
                              <span className="text-[9px] text-slate-400">
                                · Hết hạn: {new Date(share.expiresAt).toLocaleString("vi-VN")}
                              </span>
                            )}
                          </div>
                          <code className="text-[10px] text-slate-400 truncate block">
                            /share/{share.token}
                          </code>
                        </div>
                        <button
                          onClick={() => handleCopyLink(share.token)}
                          className="p-1 text-slate-400 hover:text-indigo-600 rounded cursor-pointer"
                        >
                          {copiedToken === share.token ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                        </button>
                        <button
                          onClick={() => handleDeleteShare(share.token)}
                          className="p-1 text-slate-400 hover:text-red-600 rounded cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
