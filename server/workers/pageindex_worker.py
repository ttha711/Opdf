"""Isolated PageIndex SDK worker. One JSON request on stdin, one JSON result on stdout."""
import json
import sys
from contextlib import redirect_stdout
from pathlib import Path

def main(payload):
    action = payload["action"]
    if action not in ("index", "ask", "search", "summarize", "outline"):
        raise ValueError("Unsupported PageIndex action")
    storage = Path(payload["storagePath"]).resolve()
    storage.mkdir(parents=True, exist_ok=True)
    from pageindex import PageIndexClient
    client = PageIndexClient(
        mode="local",
        index_model=payload["indexModel"],
        chat_model=payload["chatModel"],
        storage_path=str(storage),
    )
    if action == "index":
        path = Path(payload["pdfPath"]).resolve(strict=True)
        if path.suffix.lower() != ".pdf":
            raise ValueError("PDF input required")
        result = client.submit_document(str(path), mode="flash")
        return {"ok": True, "docId": result["doc_id"]}
    doc_id = payload["docId"]
    if action == "outline":
        return {"ok": True, "nodes": client.get_document_structure(doc_id)}
    query = payload["query"]
    if action == "summarize":
        query = "Summarize this document faithfully, giving page references where possible. " + query
    elif action == "search":
        query = "Find the relevant passages and report their page numbers. " + query
    answer = client.chat(query, doc_id=doc_id, citations=True)
    return {"ok": True, "answer": str(answer), "citations": []}

if __name__ == "__main__":
    try:
        request = json.load(sys.stdin)
        with redirect_stdout(sys.stderr):
            result = main(request)
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)[:400]}))
        sys.exit(1)
    print(json.dumps(result, ensure_ascii=False))
