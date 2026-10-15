import api from './client';

// Secure file download / preview. The backend checks that the logged-in user may access the file,
// so files are fetched with the token and opened from a temporary blob URL.
export async function openFile(fileId, { inline = false, name = 'file' } = {}) {
  const win = inline ? window.open('', '_blank') : null; // open first so the popup blocker allows it
  try {
    const res = await api.get(`/files/${fileId}`, {
      responseType: 'blob',
      params: inline ? { inline: 1 } : undefined,
    });
    const url = URL.createObjectURL(res.data);
    if (inline) {
      win.location = url;
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } else {
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }
  } catch (err) {
    if (win) win.close();
    throw err;
  }
}
