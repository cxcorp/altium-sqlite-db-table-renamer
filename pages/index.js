import Head from "next/head";
import Script from "next/script";

import { useCallback, useState, useEffect } from "react";
import { useDropzone } from "react-dropzone";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import styles from "../styles/Home.module.css";

const allowedExtensions = [".db", ".sqlite", ".sqlite3"];

const DropZone = ({ onSqliteFileLoaded }) => {
  const onDrop = useCallback(
    (acceptedFiles) => {
      if (acceptedFiles.length !== 1) {
        console.error("Only one file is allowed");
        return;
      }

      const file = acceptedFiles[0];
      if (!allowedExtensions.some((ext) => file.name.endsWith(ext))) {
        console.log("Unrecognized file extension in file " + file.name);
        return;
      }

      const r = new FileReader();
      const fname = file.name;
      r.onload = () => {
        const uints = new Uint8Array(r.result);
        console.log("load", uints);
        onSqliteFileLoaded(fname, uints);
      };
      r.readAsArrayBuffer(file);
    },
    [onSqliteFileLoaded]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({ onDrop });
  return (
    <div
      {...getRootProps()}
      className={`${styles.dropzone} ${
        isDragActive ? styles.dropzone__active : ""
      }`}
    >
      <input {...getInputProps()} />
      {isDragActive ? (
        // eslint-disable-next-line react/no-unescaped-entities
        <p>Drag 'n' drop some files here, or click to select files</p>
      ) : (
        // eslint-disable-next-line react/no-unescaped-entities
        <p>Drag 'n' drop some files here, or click to select files</p>
      )}
    </div>
  );
};

const SortableTableItem = ({ id, displayName, index }) => {
  const { attributes, listeners, setNodeRef, transform, transition } =
    useSortable({ id: id });

  /**
   * @type {import("react").CSSProperties}
   */
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  return (
    <li
      ref={setNodeRef}
      style={style}
      className={styles.sortable_table_item}
      {...attributes}
      {...listeners}
    >
      {(index + 1).toString().padStart(3, "0")}
      {" - "}
      {displayName}
    </li>
  );
};

const Db = ({ db, onNewDbExported }) => {
  const [tableNames, setTableNames] = useState([]);
  const sensors = useSensors(useSensor(PointerSensor));

  useEffect(() => {
    (async () => {
      const result = db.exec(
        "SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
      );
      const names = result[0].values
        .map((v) => v[0])
        .flat()
        .sort((a, b) => a.localeCompare(b));
      console.log("get tables", names);

      setTableNames(names);
    })();
  }, [db]);

  const handleDragEnd = useCallback((event) => {
    const { active, over } = event;

    if (active.id !== over.id) {
      setTableNames((names) => {
        const oldIndex = names.indexOf(active.id);
        const newIndex = names.indexOf(over.id);
        return arrayMove(names, oldIndex, newIndex);
      });
    }
  }, []);

  const handleExportClicked = useCallback(() => {
    const tableMapping = tableNames
      .map((oldTableName, newIndex) => {
        const justName = oldTableName.replace(/^\d+ - /, "");
        const newName = `${(newIndex + 1)
          .toString()
          .padStart(3, "0")} - ${justName}`;

        return [oldTableName, newName];
      })
      .filter(([oldTableName, newName]) => oldTableName !== newName);
    const escapeIdentifier = (str) => str.replace(/"/g, '""');
    const queries = tableMapping
      .map(
        ([oldTableName, newName]) =>
          `ALTER TABLE "${escapeIdentifier(
            oldTableName
          )}" RENAME TO "${escapeIdentifier(newName)}";`
      )
      .join("\n");

    console.groupCollapsed("Running alter tables");
    console.log(queries);
    console.groupEnd();

    db.run(queries);
    const data = db.export();
    onNewDbExported(data);
  }, [tableNames, db, onNewDbExported]);

  return (
    <div>
      <h3>Export</h3>
      <button onClick={handleExportClicked}>Export sqlite</button>
      <h3>Tables</h3>
      <DndContext onDragEnd={handleDragEnd}>
        <SortableContext
          items={tableNames}
          strategy={verticalListSortingStrategy}
          sensors={sensors}
        >
          <ul className={styles.sortable_container}>
            {tableNames.map((tableName, i) => (
              <SortableTableItem
                key={tableName}
                displayName={tableName.replace(/^\d+ - /, "")}
                index={i}
                id={tableName}
              />
            ))}
          </ul>
        </SortableContext>
      </DndContext>
    </div>
  );
};

export default function Index() {
  /**
   * @type {[import('sql.js').SqlJsStatic, (v:any) => void] as const}
   */
  const [SQL, setSQL] = useState(null);
  const [db, setDb] = useState(null);
  const [fileName, setFileName] = useState(null);

  const handleSqliteFileLoaded = useCallback(
    async (fileName, uint8array) => {
      if (!SQL) {
        console.error("sqlite not loaded yet");
        return;
      }

      if (db) {
        db.close();
      }

      setDb(new SQL.Database(uint8array));
      setFileName(fileName);
    },
    [SQL, db]
  );

  useEffect(() => {
    let token = setInterval(() => {
      if (typeof window.initSqlJs !== "undefined") {
        clearInterval(token);
        initSqlJs({
          locateFile: (file) => `https://sql.js.org/dist/${file}`,
        }).then((sql) => {
          console.log("sql get", sql);
          setSQL(sql);
        });
      }
    }, 500);

    return () => clearInterval(token);
  }, []);

  const handleDbExported = useCallback(
    (data) => {
      // download data as a file
      const blob = new Blob([data], { type: "application/octet-stream" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.setAttribute("download", fileName || "reordered.db");

      document.body.appendChild(a);
      a.click();

      a.parentNode.removeChild(a);
    },
    [fileName]
  );

  return (
    <>
      <Script src="https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.8.0/sql-wasm.js" />
      <div className={styles.container}>
        <Head>
          <title>Altium Designer Component SQLite DB renamer</title>
          <meta name="description" content="Generated by create next app" />
          <link rel="icon" href="/favicon.ico" />
        </Head>

        <main className={styles.main}>
          <h1>Altium Designer Component SQLite DB renamer</h1>
          {!SQL && <h2>wait for sqlite to load</h2>}
          {SQL && (
            <>
              <DropZone onSqliteFileLoaded={handleSqliteFileLoaded} />
            </>
          )}
          {db && <Db db={db} onNewDbExported={handleDbExported} />}
        </main>

        <footer className={styles.footer}>
          <a
            href="https://github.com/cxcorp/altium-sqlite-db-table-renamer"
            rel="noopener noreferrer"
          >
            GitHub
          </a>
        </footer>
      </div>
    </>
  );
}
