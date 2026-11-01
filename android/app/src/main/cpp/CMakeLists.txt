cmake_minimum_required(VERSION 3.22.1)

project("krypton-pty")

add_library(
    krypton-pty
    SHARED
    pty_bridge.c
)

find_library(log-lib log)

target_link_libraries(
    krypton-pty
    ${log-lib}
)
