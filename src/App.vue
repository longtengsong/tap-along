<script setup lang="ts">
import { ref } from 'vue';

const note = ref('');
const source = ref('');
const submittedNote = ref('');

const submitNote = () => {
  submittedNote.value = note.value.trim();
};
</script>

<template>
  <main class="page">
    <header>
      <p class="eyebrow">轻叩伴读</p>
      <h1>新页边</h1>
      <p class="intro">读到哪里，记一句。</p>
    </header>

    <form class="note-form" @submit.prevent="submitNote">
      <label for="note">笔记</label>
      <textarea
        id="note"
        v-model="note"
        placeholder="读到哪里，记一句……"
        rows="8"
      />

      <label for="source">出处</label>
      <input
        id="source"
        v-model="source"
        type="text"
        placeholder="书名 / 网页 / 电影 / 课程"
      />

      <button type="submit" :disabled="!note.trim()">收进页边</button>
    </form>

    <section v-if="submittedNote" class="result">
      <p>已收进页边</p>
      <blockquote>{{ submittedNote }}</blockquote>
      <small v-if="source.trim()">出处：{{ source }}</small>
    </section>
  </main>
</template>

<style scoped>
.page {
  display: grid;
  gap: 2rem;
}

.eyebrow {
  margin: 0 0 0.5rem;
  color: #7a6f63;
  font-size: 0.75rem;
  letter-spacing: 0.12em;
}

h1 {
  margin: 0;
  font-size: clamp(2rem, 8vw, 3.5rem);
  font-weight: 500;
}

.intro {
  margin: 0.75rem 0 0;
  color: #6f675f;
}

.note-form {
  display: grid;
  gap: 0.75rem;
}

label {
  font-size: 0.875rem;
  font-weight: 600;
}

textarea,
input {
  box-sizing: border-box;
  width: 100%;
  border: 1px solid #d8d2c8;
  border-radius: 0.75rem;
  background: #fffdf8;
  color: inherit;
  font: inherit;
  padding: 0.875rem 1rem;
}

textarea {
  resize: vertical;
  line-height: 1.65;
}

button {
  justify-self: start;
  border: 0;
  border-radius: 999px;
  background: #2f2a25;
  color: #fffdf8;
  cursor: pointer;
  font: inherit;
  padding: 0.75rem 1.25rem;
}

button:disabled {
  cursor: not-allowed;
  opacity: 0.35;
}

.result {
  border-left: 3px solid #b9ae9f;
  padding-left: 1rem;
}

.result p {
  margin: 0;
  color: #6f675f;
  font-size: 0.875rem;
}

blockquote {
  margin: 0.5rem 0;
  white-space: pre-wrap;
}

small {
  color: #7a6f63;
}
</style>
